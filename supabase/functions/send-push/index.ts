import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

async function getFirebaseAccessToken() {
  const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL');
  const privateKeyText = Deno.env.get('FCM_PRIVATE_KEY');
  if (!clientEmail || !privateKeyText) throw new Error('FCM service-account secrets are not configured');
  const privateKey = await importPKCS8(privateKeyText.replace(/\\n/g, '\n'), 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error(result.error_description || 'Firebase OAuth failed');
  return result.access_token;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authorization = request.headers.get('Authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '');
    if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: corsHeaders });

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: authResult, error: authError } = await callerClient.auth.getUser();
    if (authError || !authResult.user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: corsHeaders });

    const { notificationId, resourceId, test } = await request.json();
    if (test !== true && (!notificationId || typeof notificationId !== 'string') && (!resourceId || typeof resourceId !== 'string')) {
      return Response.json({ error: 'notificationId, resourceId, or test is required' }, { status: 400, headers: corsHeaders });
    }
    const adminClient = createClient(url, serviceKey);
    type UserNotification = { id: string; user_id: string; actor_id: string; kind: string; text: string; data: Record<string, unknown> };
    let notifications: UserNotification[] = [];
    if (test === true) {
      notifications = [{
        id: `test_${authResult.user.id}_${Date.now()}`,
        user_id: authResult.user.id,
        actor_id: authResult.user.id,
        kind: 'test',
        text: "VIT PYQ's push notification test succeeded.",
        data: {}
      }];
    } else if (resourceId) {
      const { data: ownedResource, error: resourceError } = await adminClient
        .from('papers').select('id').eq('id', resourceId).eq('uploader_id', authResult.user.id).maybeSingle();
      if (resourceError || !ownedResource) return Response.json({ error: 'Resource not authorized' }, { status: 403, headers: corsHeaders });
      const { data, error } = await adminClient
        .from('user_notifications').select('id,user_id,actor_id,kind,text,data')
        .eq('actor_id', authResult.user.id).eq('kind', 'upload')
        .contains('data', { resourceId });
      if (error) throw error;
      notifications = (data || []) as UserNotification[];
    } else {
      const { data: notification, error: notificationError } = await adminClient
        .from('user_notifications').select('id,user_id,actor_id,kind,text,data')
        .eq('id', notificationId).eq('actor_id', authResult.user.id).maybeSingle();
      if (notificationError || !notification) return Response.json({ error: 'Notification not authorized' }, { status: 403, headers: corsHeaders });
      notifications = [notification as UserNotification];
    }
    if (!notifications.length) return Response.json({ sent: 0 }, { headers: corsHeaders });

    const recipientIds = [...new Set(notifications.map(item => item.user_id))];
    const { data: subscriptions, error: subscriptionError } = await adminClient
      .from('user_push_tokens').select('user_id,fcm_token').in('user_id', recipientIds);
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) {
      return Response.json({ sent: 0, error: 'No registered push token for this account. Enable Device push notifications on this device.' }, { status: 404, headers: corsHeaders });
    }

    const projectId = Deno.env.get('FCM_PROJECT_ID');
    if (!projectId) throw new Error('FCM_PROJECT_ID is not configured');
    const accessToken = await getFirebaseAccessToken();
    let sent = 0;
    const staleTokens: string[] = [];
    const failures: string[] = [];
    for (const notification of notifications) {
      const actorId = notification.data?.actorId || notification.actor_id;
      const friendId = notification.kind === 'chat' && actorId !== notification.user_id ? String(actorId || '') : '';
      const url = notification.kind === 'upload' && notification.data?.resourceId
        ? `/?paper=${encodeURIComponent(String(notification.data.resourceId))}`
        : friendId ? `/?openChat=${encodeURIComponent(friendId)}` : './';
      for (const subscription of subscriptions.filter(item => item.user_id === notification.user_id)) {
        const result = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: subscription.fcm_token,
              data: {
                title: "VIT PYQ's",
                body: String(notification.text || 'You have a new update.').slice(0, 240),
                friendId,
                url
              }
            }
          })
        });
        if (result.ok) sent++;
        else {
          const failure = await result.json().catch(() => ({}));
          if (failure.error?.details?.some((detail: { errorCode?: string }) => detail.errorCode === 'UNREGISTERED')) staleTokens.push(subscription.fcm_token);
          const reason = failure.error?.message || `Firebase returned HTTP ${result.status}`;
          failures.push(reason.slice(0, 400));
          console.warn('[send-push] FCM delivery failed', { status: result.status, message: reason });
        }
      }
    }
    if (staleTokens.length) await adminClient.from('user_push_tokens').delete().in('fcm_token', staleTokens);
    return Response.json({ sent, failed: failures.length, errors: failures }, {
      status: sent === 0 && failures.length ? 502 : 200,
      headers: corsHeaders
    });
  } catch (error) {
    console.error('[send-push]', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Push delivery failed' }, { status: 500, headers: corsHeaders });
  }
});
