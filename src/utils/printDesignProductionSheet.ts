import type { Lead } from '../types';

function runIframePrint(html: string) {
  const existingIframe = document.getElementById('eco-print-iframe');
  if (existingIframe && existingIframe.parentNode) {
    existingIframe.parentNode.removeChild(existingIframe);
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'eco-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '1024px';
  iframe.style.height = '768px';
  iframe.style.border = '0';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn("Iframe print blocked, opening dedicated print window:", err);
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        printWin.print();
      }
    }
  };

  iframe.onload = () => {
    setTimeout(triggerPrint, 250);
  };
  setTimeout(triggerPrint, 500);

  setTimeout(() => {
    try {
      const el = document.getElementById('eco-print-iframe');
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    } catch {
      // ignore cleanup error
    }
  }, 120000);
}

// =========================================================================
// 1. DESIGN TEAM CHECKLIST (Details provided by Sales Team)
// =========================================================================
export function printDesignTeamChecklist(lead: Lead) {
  if (!lead) return;

  const refNumber = `DES-${lead.id.slice(0, 8).toUpperCase()}`;
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const referenceImages: string[] = Array.isArray(lead.reference_designs)
    ? lead.reference_designs
    : [];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Design Team Job Sheet - ${refNumber} - ${lead.company || lead.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.35;
      color: #1e293b;
      background: #ffffff;
    }
    .sheet-container {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #006766;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 800;
      color: #006766;
      letter-spacing: -0.5px;
      text-transform: uppercase;
    }
    .brand-subtitle {
      font-size: 10px;
      color: #607C7B;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .ref-badge {
      display: inline-block;
      background: #006766;
      color: #ffffff;
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .header-date {
      font-size: 9.5px;
      color: #64748b;
      margin-top: 3px;
      text-align: right;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }
    .card {
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      padding: 5px 7px;
      background: #f8fafc;
    }
    .card-title {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #006766;
      margin-bottom: 2px;
    }
    .card-value {
      font-size: 11.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .card-subtext {
      font-size: 9px;
      color: #64748b;
      margin-top: 1px;
    }
    .section-title {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #ffffff;
      background: #006766;
      padding: 3.5px 7px;
      border-radius: 4px;
      margin: 7px 0 5px 0;
      display: flex;
      justify-content: space-between;
    }
    .section-sub {
      font-size: 8.5px;
      font-weight: normal;
      color: #e2e8f0;
    }
    table.specs-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
    }
    table.specs-table th, table.specs-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      font-size: 9.5px;
      text-align: left;
    }
    table.specs-table th {
      background: #f1f5f9;
      font-weight: 700;
      color: #334155;
      width: 33%;
    }
    table.specs-table td {
      background: #ffffff;
      color: #0f172a;
      font-weight: 600;
    }
    .asset-box {
      border: 1px dashed #006766;
      border-radius: 5px;
      padding: 6px;
      text-align: center;
      background: #ffffff;
      min-height: 85px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .asset-box img {
      max-height: 75px;
      max-width: 100%;
      object-fit: contain;
      border-radius: 3px;
    }
    table.checklist-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      margin-bottom: 7px;
    }
    table.checklist-table th, table.checklist-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      font-size: 9px;
    }
    table.checklist-table th {
      background: #f1f5f9;
      font-weight: 700;
      color: #1e293b;
      text-transform: uppercase;
    }
    .check-box {
      width: 13px;
      height: 13px;
      border: 1.5px solid #006766;
      border-radius: 2.5px;
      display: inline-block;
      vertical-align: middle;
      margin-right: 4px;
    }
    .sign-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .sign-table td {
      border: 1px solid #cbd5e1;
      padding: 8px 6px 5px 6px;
      width: 50%;
      vertical-align: bottom;
      font-size: 9px;
      background: #f8fafc;
    }
    .sign-line {
      border-bottom: 1px dotted #94a3b8;
      height: 20px;
      margin-bottom: 3px;
    }
    .sign-title {
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="sheet-container">
    
    <!-- Header -->
    <div class="header">
      <div>
        <div class="brand-title">ECOTROPHY DESIGN TEAM JOB SHEET</div>
        <div class="brand-subtitle">Details Provided by Sales Team &bull; Creative Brief &amp; Checklist</div>
      </div>
      <div>
        <div class="ref-badge">${refNumber}</div>
        <div class="header-date">Date: ${currentDate}</div>
      </div>
    </div>

    <!-- Client & Contact Summary Grid -->
    <div class="grid-4">
      <div class="card">
        <div class="card-title">1. Company / Organization</div>
        <div class="card-value">${lead.company || lead.name}</div>
        <div class="card-subtext">Contact: ${lead.name}</div>
      </div>
      <div class="card">
        <div class="card-title">2. Contact Details</div>
        <div class="card-value">${lead.phone || 'No phone'}</div>
        <div class="card-subtext">${lead.email || 'No email'}</div>
      </div>
      <div class="card">
        <div class="card-title">3. Order Quantity &amp; Budget</div>
        <div class="card-value" style="color: #006766;">${lead.required_quantity || 1} PCS</div>
        <div class="card-subtext">Budget: ${lead.budget || lead.value ? `₹${Number(lead.budget || lead.value).toLocaleString('en-IN')}` : 'TBD'}</div>
      </div>
      <div class="card">
        <div class="card-title">4. Event Name &amp; Date</div>
        <div class="card-value">${lead.event_name || 'Annual Awards'}</div>
        <div class="card-subtext">Date: ${lead.event_date || 'TBD'}</div>
      </div>
    </div>

    <!-- Section: Milestone Deadlines Provided by Sales -->
    <div class="section-title">
      <span>Critical Milestone Deadlines (Provided by Sales Team)</span>
      <span class="section-sub">SLA Timelines</span>
    </div>

    <div class="grid-3" style="margin-bottom: 6px;">
      <div class="card">
        <div class="card-title">1. Design Deadline</div>
        <div class="card-value" style="color: #006766;">${lead.design_deadline || 'Urgent / TBD'}</div>
        <div class="card-subtext">Target for client proof approval</div>
      </div>
      <div class="card">
        <div class="card-title">2. Production Deadline</div>
        <div class="card-value" style="color: #894C2D;">${lead.production_deadline || 'Scheduled with Factory'}</div>
        <div class="card-subtext">Target manufacturing date</div>
      </div>
      <div class="card">
        <div class="card-title">3. Delivery Deadline</div>
        <div class="card-value">${lead.delivery_date || 'Before Event Date'}</div>
        <div class="card-subtext">Client dispatch date</div>
      </div>
    </div>

    <!-- Section: Creative Specifications Provided by Sales -->
    <div class="section-title">
      <span>Creative &amp; Physical Specifications (Provided by Sales Team)</span>
      <span class="section-sub">Sales Requirements</span>
    </div>

    <div class="grid-2">
      <table class="specs-table">
        <tr>
          <th>Product Size / Dimensions</th>
          <td style="font-weight: 800; color: #006766;">${lead.trophy_size || 'To be proposed by designer'}</td>
        </tr>
        <tr>
          <th>Creative Concept</th>
          <td>${lead.concept || 'Custom corporate eco-award'}</td>
        </tr>
        <tr>
          <th>Theme</th>
          <td>${lead.theme || 'Eco-friendly sustainable excellence'}</td>
        </tr>
        <tr>
          <th>Shapes</th>
          <td>${lead.shapes || 'Modern geometric / organic'}</td>
        </tr>
      </table>

      <table class="specs-table">
        <tr>
          <th>Models (Variants)</th>
          <td>${(lead as any).models || 'Standard award model'}</td>
        </tr>
        <tr>
          <th>Customer Brand Colors</th>
          <td style="font-weight: 800; color: #006766;">${lead.brand_colors || 'Natural Wood, Gold, Black'}</td>
        </tr>
        <tr>
          <th>Requested Material</th>
          <td>${lead.material || 'Reclaimed Teak wood / Clear Acrylic / Brass'}</td>
        </tr>
        <tr>
          <th>Design Notes / Engraving</th>
          <td>${lead.design_notes || 'Logo engraving with event citation'}</td>
        </tr>
      </table>
    </div>

    <!-- Visual Assets Provided by Sales -->
    <div class="section-title">
      <span>Customer Brand Logo &amp; Reference Designs (Provided by Sales)</span>
      <span class="section-sub">Design Inspirations</span>
    </div>

    <div class="grid-2">
      <div class="asset-box">
        ${((lead as any).logo_url || lead.artwork_url) ? `
          <img src="${(lead as any).logo_url || lead.artwork_url}" alt="Customer Logo">
          <div style="font-size: 8px; font-weight: 700; color: #006766; margin-top: 3px;">
            CUSTOMER OFFICIAL LOGO
          </div>
        ` : `
          <div style="color: #94a3b8; font-size: 9.5px; font-style: italic;">
            No official logo uploaded by sales.<br>Check email or WhatsApp attachments.
          </div>
        `}
      </div>

      <div class="asset-box">
        ${referenceImages.length > 0 ? `
          <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
            ${referenceImages.slice(0, 3).map((r, i) => `
              <img key="${i}" src="${r}" style="max-height: 65px; border-radius: 3px; border: 1px solid #cbd5e1;" alt="Ref ${i + 1}">
            `).join('')}
          </div>
          <div style="font-size: 8px; font-weight: 700; color: #006766; margin-top: 3px;">
            REFERENCE DESIGN / INSPIRATION ATTACHED (${referenceImages.length})
          </div>
        ` : `
          <div style="color: #94a3b8; font-size: 9.5px; font-style: italic;">
            No reference images attached by sales.<br>Create bespoke layout based on concept.
          </div>
        `}
      </div>
    </div>

    <!-- Design Team Process Checklist -->
    <div class="section-title">
      <span>Design Team Execution Checklist</span>
      <span class="section-sub">Step-by-Step Workflow</span>
    </div>

    <table class="checklist-table">
      <thead>
        <tr>
          <th style="width: 5%;">#</th>
          <th style="width: 55%;">Creative Milestone &amp; Quality Checkpoint</th>
          <th style="width: 20%;">Target Deliverable</th>
          <th style="width: 20%;">Designer Sign-off</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align: center; font-weight: bold;">1</td>
          <td><span class="check-box"></span> Customer Logo &amp; Vector Assets Quality Verified</td>
          <td>High-res / Vector</td>
          <td>[ &nbsp; ] Done &nbsp; Initials: ____</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">2</td>
          <td><span class="check-box"></span> Concept &amp; Brand Color Palette Aligned with Brief</td>
          <td>Color Scheme</td>
          <td>[ &nbsp; ] Done &nbsp; Initials: ____</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">3</td>
          <td><span class="check-box"></span> 2D Concept Layout / 3D Visual Mockup (v1) Created</td>
          <td>Draft Mockup v1</td>
          <td>[ &nbsp; ] Done &nbsp; Initials: ____</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">4</td>
          <td><span class="check-box"></span> Proof Sent to Sales Rep &amp; Customer for Approval</td>
          <td>Proofing Share</td>
          <td>[ &nbsp; ] Done &nbsp; Initials: ____</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">5</td>
          <td><span class="check-box"></span> Client Revisions &amp; Spacing Corrections Updated</td>
          <td>Mockup v2 / Final</td>
          <td>[ &nbsp; ] Done &nbsp; Initials: ____</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">6</td>
          <td><span class="check-box"></span> Final Client Sign-off / Written Approval Received</td>
          <td>Approved Status</td>
          <td>[ &nbsp; ] Done &nbsp; Initials: ____</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">7</td>
          <td><span class="check-box"></span> 9 Production Specifications Filled for Factory Floor</td>
          <td>Handoff Form</td>
          <td>[ &nbsp; ] Done &nbsp; Initials: ____</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">8</td>
          <td><span class="check-box"></span> Vector Toolpath / UV Print Ready File Sent to Factory</td>
          <td>Factory Cut File</td>
          <td>[ &nbsp; ] Done &nbsp; Initials: ____</td>
        </tr>
      </tbody>
    </table>

    <!-- Sign-off Block -->
    <table class="sign-table">
      <tr>
        <td>
          <div class="sign-line"></div>
          <div class="sign-title">Sales Representative (Brief Hand-off)</div>
          <div>Sales Rep: ${lead.sales_person || 'Sales Team'}</div>
        </td>
        <td>
          <div class="sign-line"></div>
          <div class="sign-title">Assigned Designer (Creative Approval)</div>
          <div>Designer: ${lead.design_person || 'Design Team'}</div>
        </td>
      </tr>
    </table>

  </div>
</body>
</html>`;

  runIframePrint(html);
}

// =========================================================================
// 2. PRODUCTION TEAM CHECKLIST (Details provided by Design Team)
// =========================================================================
export function printProductionTeamChecklist(lead: Lead) {
  if (!lead) return;

  const refNumber = `PRD-${lead.id.slice(0, 8).toUpperCase()}`;
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const latestMockup =
    lead.mockups && lead.mockups.length > 0
      ? lead.mockups[lead.mockups.length - 1]
      : null;
  const approvedMockup = lead.mockups?.find((m) => m.status === 'approved') || latestMockup;
  const previewImage = approvedMockup?.url || lead.artwork_url || '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Production Team Checklist - ${refNumber} - ${lead.company || lead.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.35;
      color: #1e293b;
      background: #ffffff;
    }
    .sheet-container {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #006766;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 800;
      color: #006766;
      letter-spacing: -0.5px;
      text-transform: uppercase;
    }
    .brand-subtitle {
      font-size: 10px;
      color: #607C7B;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .ref-badge {
      display: inline-block;
      background: #006766;
      color: #ffffff;
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .header-date {
      font-size: 9.5px;
      color: #64748b;
      margin-top: 3px;
      text-align: right;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }
    .card {
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      padding: 5px 7px;
      background: #f8fafc;
    }
    .card-title {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #006766;
      margin-bottom: 2px;
    }
    .card-value {
      font-size: 11.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .card-subtext {
      font-size: 9px;
      color: #64748b;
      margin-top: 1px;
    }
    .section-title {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #ffffff;
      background: #006766;
      padding: 3.5px 7px;
      border-radius: 4px;
      margin: 7px 0 5px 0;
      display: flex;
      justify-content: space-between;
    }
    .section-sub {
      font-size: 8.5px;
      font-weight: normal;
      color: #e2e8f0;
    }
    table.specs-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
    }
    table.specs-table th, table.specs-table td {
      border: 1px solid #cbd5e1;
      padding: 4.5px 6.5px;
      font-size: 9.5px;
      text-align: left;
    }
    table.specs-table th {
      background: #f1f5f9;
      font-weight: 700;
      color: #334155;
      width: 35%;
    }
    table.specs-table td {
      background: #ffffff;
      color: #0f172a;
      font-weight: 600;
    }
    .artwork-box {
      border: 1px dashed #006766;
      border-radius: 5px;
      padding: 6px;
      text-align: center;
      background: #ffffff;
      min-height: 85px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .artwork-box img {
      max-height: 80px;
      max-width: 100%;
      object-fit: contain;
      border-radius: 3px;
    }
    table.checklist-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      margin-bottom: 7px;
    }
    table.checklist-table th, table.checklist-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      font-size: 9px;
    }
    table.checklist-table th {
      background: #f1f5f9;
      font-weight: 700;
      color: #1e293b;
      text-transform: uppercase;
    }
    .check-box {
      width: 13px;
      height: 13px;
      border: 1.5px solid #006766;
      border-radius: 2.5px;
      display: inline-block;
      vertical-align: middle;
      margin-right: 4px;
    }
    .sign-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .sign-table td {
      border: 1px solid #cbd5e1;
      padding: 8px 6px 5px 6px;
      width: 33.33%;
      vertical-align: bottom;
      font-size: 9px;
      background: #f8fafc;
    }
    .sign-line {
      border-bottom: 1px dotted #94a3b8;
      height: 20px;
      margin-bottom: 3px;
    }
    .sign-title {
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="sheet-container">
    
    <!-- Header -->
    <div class="header">
      <div>
        <div class="brand-title">ECOTROPHY PRODUCTION TEAM CHECKLIST</div>
        <div class="brand-subtitle">Details Provided by Design Team &bull; Factory Work Order &amp; QC Checklist</div>
      </div>
      <div>
        <div class="ref-badge">${refNumber}</div>
        <div class="header-date">Date: ${currentDate}</div>
      </div>
    </div>

    <!-- Client & Production Target Grid -->
    <div class="grid-4">
      <div class="card">
        <div class="card-title">Client / Organization</div>
        <div class="card-value">${lead.company || lead.name}</div>
        <div class="card-subtext">Contact: ${lead.name}</div>
      </div>
      <div class="card">
        <div class="card-title">Order Quantity</div>
        <div class="card-value" style="color: #006766;">${lead.required_quantity ? `${lead.required_quantity} PCS` : '1 PC (Sample)'}</div>
        <div class="card-subtext">Status: ${(lead.status || 'In Production').replace(/_/g, ' ')}</div>
      </div>
      <div class="card">
        <div class="card-title">Production Deadline</div>
        <div class="card-value" style="color: #894C2D;">${lead.production_deadline || 'Standard Schedule'}</div>
        <div class="card-subtext">Final Event: ${lead.event_date || 'N/A'}</div>
      </div>
      <div class="card">
        <div class="card-title">Handoff Designer</div>
        <div class="card-value">${lead.design_person || 'Design Team'}</div>
        <div class="card-subtext">Sales: ${lead.sales_person || 'Sales Team'}</div>
      </div>
    </div>

    <!-- Section: 9 Targeted Parameters Provided by Design Team -->
    <div class="section-title">
      <span>The 9 Production Parameters (Provided by Design Team)</span>
      <span class="section-sub">Strict Factory Specifications</span>
    </div>

    <div class="grid-2">
      <div>
        <table class="specs-table">
          <tr>
            <th>1. Size / Dimensions</th>
            <td style="font-weight: 800; color: #006766; font-size: 11px;">${lead.trophy_size || 'To be specified by design'}</td>
          </tr>
          <tr>
            <th>2. Materials to Use in Trophy</th>
            <td>${lead.trophy_materials_used || lead.material || 'Standard composite wood / acrylic'}</td>
          </tr>
          <tr>
            <th>3. Stock (Materials) to Buy</th>
            <td>
              <strong style="color: #006766;">${(lead.materials_stock_status || 'In Stock').replace(/_/g, ' ').toUpperCase()}</strong>
              ${lead.materials_to_buy ? `<br><span style="font-size: 9px; color: #894C2D;">Purchase Required: ${lead.materials_to_buy}</span>` : '<br><span style="font-size: 9px; color: #64748b;">All materials in stock</span>'}
            </td>
          </tr>
          <tr>
            <th>4. Prototype Sample Status</th>
            <td>
              <strong>${(lead.prototype_status || 'Not Required').replace(/_/g, ' ').toUpperCase()}</strong>
              ${lead.prototype_notes ? `<br><span style="font-size: 9px; color: #64748b;">${lead.prototype_notes}</span>` : ''}
            </td>
          </tr>
          <tr>
            <th>9. Production Deadline</th>
            <td style="font-weight: 800; color: #894C2D;">${lead.production_deadline || 'Open / Pending Timeline'}</td>
          </tr>
        </table>
      </div>

      <div>
        <table class="specs-table">
          <tr>
            <th>5. Packing Single Box Size</th>
            <td style="font-weight: 800;">${lead.single_box_size || 'Standard individual presentation box'}</td>
          </tr>
          <tr>
            <th>6. Whole Box Size (Master Carton)</th>
            <td style="font-weight: 800;">${lead.master_box_size || 'Standard corrugated master carton'}</td>
          </tr>
          <tr>
            <th>7. Delivery Logistics Mode</th>
            <td>
              <strong style="color: #006766;">${(lead.delivery_mode || 'Courier Service').replace(/_/g, ' ').toUpperCase()}</strong>
              ${lead.delivery_details ? `<br><span style="font-size: 9px; color: #64748b;">Transit: ${lead.delivery_details}</span>` : ''}
            </td>
          </tr>
          <tr>
            <th>8. Delivery Destination Location</th>
            <td>${lead.delivery_location || lead.location || 'Customer pickup or address pending'}</td>
          </tr>
        </table>

        <!-- Mockup Visual -->
        <div class="artwork-box" style="margin-top: 5px;">
          ${previewImage ? `
            <img src="${previewImage}" alt="Approved Artwork">
            <div style="font-size: 8px; font-weight: 700; color: #006766; margin-top: 2px;">
              APPROVED ARTWORK MOCKUP FOR PRODUCTION
            </div>
          ` : `
            <div style="color: #94a3b8; font-size: 9.5px; font-style: italic;">
              Refer to digital vector file (.ai / .pdf) for laser engraving.
            </div>
          `}
        </div>
      </div>
    </div>

    <!-- Factory Floor Production Checklist -->
    <div class="section-title">
      <span>Production Floor Quality &amp; Dispatch Checklist</span>
      <span class="section-sub">Must be completed before packaging &amp; dispatch</span>
    </div>

    <table class="checklist-table">
      <thead>
        <tr>
          <th style="width: 5%;">#</th>
          <th style="width: 45%;">Manufacturing Milestone &amp; Quality Check</th>
          <th style="width: 30%;">Design Specification Target</th>
          <th style="width: 20%;">QC Sign-off</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align: center; font-weight: bold;">1</td>
          <td><span class="check-box"></span> Raw Materials Checked &amp; Issued from Stock</td>
          <td>${lead.trophy_materials_used || lead.material || 'Raw materials verified'}</td>
          <td>[ &nbsp; ] Pass &nbsp; Sign: ______</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">2</td>
          <td><span class="check-box"></span> Cutting, Sizing &amp; Wood/Acrylic Machining</td>
          <td>Size: ${lead.trophy_size || 'As per design'}</td>
          <td>[ &nbsp; ] Pass &nbsp; Sign: ______</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">3</td>
          <td><span class="check-box"></span> UV Color Print / Laser Engraving Verified</td>
          <td>Spellings &amp; Logo checked vs Mockup</td>
          <td>[ &nbsp; ] Pass &nbsp; Sign: ______</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">4</td>
          <td><span class="check-box"></span> Assembly, Buffing, Gluing &amp; Surface Finishing</td>
          <td>Zero scratches, chips or glue residue</td>
          <td>[ &nbsp; ] Pass &nbsp; Sign: ______</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">5</td>
          <td><span class="check-box"></span> Quality Inspection (QC Passed - 100% Ok)</td>
          <td>100% Quality Inspection Passed</td>
          <td>[ &nbsp; ] Pass &nbsp; Sign: ______</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">6</td>
          <td><span class="check-box"></span> Individual Inner Presentation Box Packed</td>
          <td>Single Box: ${lead.single_box_size || 'Standard Box'}</td>
          <td>[ &nbsp; ] Pass &nbsp; Sign: ______</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">7</td>
          <td><span class="check-box"></span> Master Outer Carton Packed &amp; Bubble-Wrapped</td>
          <td>Whole Box: ${lead.master_box_size || 'Standard Master'}</td>
          <td>[ &nbsp; ] Pass &nbsp; Sign: ______</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">8</td>
          <td><span class="check-box"></span> Dispatched via Transport Partner with Tracking Slip</td>
          <td>${(lead.delivery_mode || 'Courier').toUpperCase()} &bull; ${lead.delivery_location || 'Address'}</td>
          <td>[ &nbsp; ] Pass &nbsp; Sign: ______</td>
        </tr>
      </tbody>
    </table>

    <!-- Sign-off Block -->
    <table class="sign-table">
      <tr>
        <td>
          <div class="sign-line"></div>
          <div class="sign-title">1. Design Team Handoff</div>
          <div>Designer: ${lead.design_person || 'Design Staff'}</div>
        </td>
        <td>
          <div class="sign-line"></div>
          <div class="sign-title">2. Factory QC In-Charge</div>
          <div>Manufacturing Approval</div>
        </td>
        <td>
          <div class="sign-line"></div>
          <div class="sign-title">3. Packaging &amp; Dispatch Lead</div>
          <div>Courier / Bus Waybill Slip Attached</div>
        </td>
      </tr>
    </table>

  </div>
</body>
</html>`;

  runIframePrint(html);
}

// Backward-compatible alias
export const printDesignProductionSheet = printProductionTeamChecklist;
