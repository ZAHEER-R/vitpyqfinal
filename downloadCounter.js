// downloadCounter.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Replace with your Supabase project details
const supabaseUrl = "https://pzebtixnzskprzcovalx.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6ZWJ0aXhuenNrcHJ6Y292YWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNTk2MDEsImV4cCI6MjA3OTgzNTYwMX0.fLQ3_si0LqRovxmI0wkreEMdwGRFn9NB_0LzmXjchd8"; // use anon public key
const supabase = createClient(supabaseUrl, supabaseKey);

export async function incrementDownloadCount() {
  try {
    // Step 1: Fetch current count
    let { data, error } = await supabase
      .from("site_stats")
      .select("download_count")
      .eq("id", 1)
      .single();

    if (error) throw error;

    let newCount = data.download_count + 1;

    // Step 2: Update count in Supabase
    let { error: updateError } = await supabase
      .from("site_stats")
      .update({ download_count: newCount })
      .eq("id", 1);

    if (updateError) throw updateError;

    // Step 3: Update HTML
    const display = document.getElementById("profileDownloads");
    if (display) {
      display.textContent = newCount;
    }

    console.log("Download count updated:", newCount);
  } catch (err) {
    console.error("Error updating download count:", err.message);
  }
}
