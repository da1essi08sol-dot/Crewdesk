module.exports = async (setup) => { const T = await setup('lone');
  await T.card('Stay safe', 'Lone working check-ins'); await T.uncard();
  await T.go('#/lone', 1400);
  await T.cap('Buddies and admins see everyone working alone right now.', 2800);
  await T.scroll(9999, 900);
  await T.cap('Missed a check-in? You get an urgent alert. Call them, open the map, or tap I’m responding.', 3200);
  { const l = T.page.locator('[data-act="lone-ack"]').first(); await l.scrollIntoViewIfNeeded(); const bb = await l.boundingBox();
    if (bb) await T.page.evaluate(([x, y]) => { const d = document.createElement('div'); d.className = 'tut-tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 800); }, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
    await T.w(250); await l.click({ force: true }); await T.w(1400); }
  await T.scroll(-9999, 700);
  await T.cap('Working alone yourself? Say where, how often to check in, and pick a buddy.', 2600);
  await T.type('form[data-form="lone-start"] input[name="where"]', 'Valve survey, Elswick Road');
  await T.tap('.lone-pill:has(input[value="30"])', 500);
  await T.page.selectOption('form[data-form="lone-start"] select[name="buddy"] >> nth=0', { index: 1 }).catch(() => {});
  await T.tap('form[data-form="lone-start"] .lone-go', 1600);
  await T.cap('The dial counts down to your next check-in. Your phone buzzes when it’s due.', 2800);
  await T.tap('[data-act="lone-checkin"]', 1400);
  await T.cap('Tap I’m safe to check in. Add time, or finish when you’re done.', 2600);
  await T.cap('In trouble? Hold the red button for 1 second. It alerts everyone and sounds a loud siren.', 3000);
  const b = await T.page.locator('.lone-sos').boundingBox();
  if (b) { await T.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await T.page.mouse.down(); await T.w(2300); await T.page.mouse.up(); }
  await T.w(1400);
  await T.page.evaluate(() => { try { Siren.stop(); } catch (_) {} });
  await T.cap('Help is told straight away. Cancel it once you’re safe.', 2600);
  await T.tap('[data-act="lone-safe"]', 1400);
  await T.cap('Location is only shared from the Crewdesk Android app.', 2600);
  await T.nocap(); await T.card('Stay safe', 'Nobody works alone unseen', 2200); await T.done(); };
