// Files: training documents and resources, plus the Maps folder.
const path = require('path'); const FX = path.join(__dirname, '..', 'fixtures');
module.exports = async (setup) => { const T = await setup('files');
  await T.card('Files & resources', 'Training documents, guides and forms in one place'); await T.uncard();
  await T.go('#/files', 1400);
  await T.cap('Files keeps the team’s training documents, guides and forms.', 2600);
  await T.cap('Filter by category…', 1000);
  await T.tap('[data-act="res-cat"][data-c="Training"]', 1600);
  await T.tap('[data-act="res-cat"][data-c=""]', 900);
  await T.cap('…or search for what you need.', 1000);
  await T.type('[data-res-q]', 'manhole'); await T.w(1400);
  await T.page.locator('[data-res-q]').fill(''); await T.page.locator('[data-res-q]').dispatchEvent('input'); await T.w(900);
  await T.cap('Add your own: a title, a category, a description, a photo and files.', 1300);
  await T.tap('[data-act="res-new"]', 1200);
  await T.type('input[name="title"]', 'Manhole survey checklist');
  await T.type('input[name="category"]', 'Procedures');
  await T.type('textarea[name="body"]', 'Print this and tick it off on site before lifting any cover.');
  const choose = async (sel) => {
    const fc = T.page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null);
    await T.tap(sel, 500); let c = await fc;
    if (!c) { const lib = T.page.locator('.sheet button, .menu-pop button').filter({ hasText: /library|choose|files|photo/i }).first(); const fc2 = T.page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null); if (await lib.count()) await lib.click(); c = await fc2; }
    return c;
  };
  let c = await choose('[data-act="att-photos"]'); if (c) await c.setFiles(path.join(FX, 'site-photo.jpg')); await T.w(1500);
  c = await choose('[data-act="att-docs"]'); if (c) await c.setFiles(path.join(FX, 'Manhole survey checklist.pdf')); await T.w(2200);
  await T.cap('The first photo becomes the cover picture.', 1200);
  await T.tap('form[data-form="res"] .sheet-foot .btn.primary', 2600);
  await T.cap('Everyone can open the files or save them to their device.', 2600);
  await T.go('#/files', 1200);
  await T.cap('Manhole maps live in the Maps folder.', 1000);
  await T.tap('.res-folder', 2400);
  await T.nocap();
  await T.card('Files & resources', 'Share what the team needs to know', 2200); await T.done(); };
