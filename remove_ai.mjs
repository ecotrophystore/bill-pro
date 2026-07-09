import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pagesDir = path.join(__dirname, 'src', 'pages');
const layoutFile = path.join(__dirname, 'src', 'components', 'Layout', 'AppLayout.tsx');
const dashboardFile = path.join(__dirname, 'src', 'pages', 'Dashboard.tsx');

// 1. Remove VoiceDictation
const files = fs.readdirSync(pagesDir).map(f => path.join(pagesDir, f));
files.push(layoutFile);
files.push(dashboardFile);

files.forEach(file => {
  if (!fs.statSync(file).isFile()) return;
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Remove import VoiceDictation
  content = content.replace(/import\s+VoiceDictation\s+from\s+['"]\.\.\/components\/VoiceDictation['"];?
?/g, '');
  
  // Remove <VoiceDictation ... />
  content = content.replace(/<VoiceDictation[\s\S]*?\/>
?/g, '');

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file} (VoiceDictation)`);
  }
});

// 2. Remove AIAuditor from AppLayout.tsx
if (fs.existsSync(layoutFile)) {
  let layoutContent = fs.readFileSync(layoutFile, 'utf8');
  layoutContent = layoutContent.replace(/import\s+\{\s*AIAuditor\s*\}\s+from\s+['"]\.\.\/AI\/AIAuditor['"];?
?/g, '');
  layoutContent = layoutContent.replace(/\s*<AIAuditor\s*\/>
?/g, '');
  // Remove Bot icon and menu item
  layoutContent = layoutContent.replace(/Bot,\s*/g, '');
  layoutContent = layoutContent.replace(/\s*\{\s*path:\s*'\/auditor',\s*label:\s*'AI Auditor',\s*icon:\s*Bot\s*\},
?/g, '');
  fs.writeFileSync(layoutFile, layoutContent);
  console.log('Updated AppLayout.tsx');
}

// 3. Remove AIAuditor tip from Dashboard.tsx
if (fs.existsSync(dashboardFile)) {
  let dashContent = fs.readFileSync(dashboardFile, 'utf8');
  const tipRegex = /\s*<div className="neo-card flex flex-col">\s*<h3 className="mb-4">AI Auditor Tip<\/h3>[\s\S]*?<\/div>\s*<\/div>
?/g;
  dashContent = dashContent.replace(tipRegex, '');
  dashContent = dashContent.replace(/<div className="neo-card lg:col-span-2/g, '<div className="neo-card lg:col-span-3');
  fs.writeFileSync(dashboardFile, dashContent);
  console.log('Updated Dashboard.tsx');
}