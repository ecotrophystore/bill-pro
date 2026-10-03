import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

const placesApiKey = defineSecret("GOOGLE_PLACES_API_KEY");
const db = getFirestore();

export const onLeadCreatedEnrich = onDocumentCreated(
  {
    document: "leads/{leadId}",
    region: "asia-south1",
    secrets: [placesApiKey]
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const companyName = data.company;

    if (!companyName || typeof companyName !== 'string' || companyName.trim().length === 0) {
      console.log(`Lead ${event.params.leadId} has no company name. Skipping enrichment.`);
      return;
    }

    console.log(`Enriching company via Places API: ${companyName} for lead ${event.params.leadId}`);
    
    try {
      const apiKey = placesApiKey.value();
      if (!apiKey) {
        console.error("GOOGLE_PLACES_API_KEY secret is not set.");
        return;
      }

      const query = encodeURIComponent(companyName);
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`;
      
      const response = await fetch(url);
      const result = await response.json();

      let enrichedData = {
        status: 'not_found',
        provider: 'google_places',
        last_enriched_at: FieldValue.serverTimestamp(),
        data: {} as any,
        raw_response: result
      };

      if (result.results && result.results.length > 0) {
        const item = result.results[0];
        
        let website = '';
        let phone = '';
        
        // Fetch place details for website and phone number
        if (item.place_id) {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${item.place_id}&fields=name,website,formatted_phone_number&key=${apiKey}`;
          try {
            const detailsRes = await fetch(detailsUrl);
            const detailsJson = await detailsRes.json();
            if (detailsJson.result) {
              website = detailsJson.result.website || '';
              phone = detailsJson.result.formatted_phone_number || '';
            }
          } catch(e) {
            console.error("Failed to fetch place details", e);
          }
        }
        
        let desc = item.formatted_address || '';
        if (phone) desc += ` | Phone: ${phone}`;

        enrichedData.status = 'success';
        enrichedData.data = {
          name: item.name || companyName,
          description: desc,
          website: website,
          logo_url: item.icon || ''
        };
      }

      await snapshot.ref.update({
        company_intelligence: enrichedData
      });

      console.log(`Successfully enriched lead ${event.params.leadId}`);
    } catch (error) {
      console.error(`Error enriching lead ${event.params.leadId}:`, error);
      await snapshot.ref.update({
        company_intelligence: {
          status: 'failed',
          provider: 'google_places',
          last_enriched_at: FieldValue.serverTimestamp(),
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
);

export const enrichCompanyManual = onCall({ region: "asia-south1", secrets: [placesApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
  
  const { leadId, companyName } = request.data;
  if (!companyName) {
    throw new HttpsError("invalid-argument", "Missing companyName");
  }

  const apiKey = placesApiKey.value();
  if (!apiKey) {
    throw new HttpsError("internal", "API Key not configured");
  }

  try {
    const query = encodeURIComponent(companyName);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`;
    
    const response = await fetch(url);
    const result = await response.json();

    let enrichedData = {
      status: 'not_found',
      provider: 'google_places',
      last_enriched_at: FieldValue.serverTimestamp(),
      data: {} as any,
      raw_response: result
    };

    if (result.results && result.results.length > 0) {
      const item = result.results[0];
      
      let website = '';
      let phone = '';
      
      if (item.place_id) {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${item.place_id}&fields=name,website,formatted_phone_number&key=${apiKey}`;
        try {
          const detailsRes = await fetch(detailsUrl);
          const detailsJson = await detailsRes.json();
          if (detailsJson.result) {
            website = detailsJson.result.website || '';
            phone = detailsJson.result.formatted_phone_number || '';
          }
        } catch(e) {
          console.error("Failed to fetch place details", e);
        }
      }
      
      let desc = item.formatted_address || '';
      if (phone) desc += ` | Phone: ${phone}`;

      enrichedData.status = 'success';
      enrichedData.data = {
        name: item.name || companyName,
        description: desc,
        website: website,
        logo_url: item.icon || ''
      };
    }

    if (leadId) {
      await db.collection('leads').doc(leadId).update({
        company_intelligence: enrichedData
      });
    }

    return { success: true, status: enrichedData.status, data: enrichedData.data };
  } catch (error) {
    console.error("Manual enrichment failed:", error);
    throw new HttpsError("internal", "Failed to enrich company data");
  }
});
