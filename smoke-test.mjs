import { chromium } from 'playwright'

const BASE = 'http://localhost:4173'
const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

function log(msg, ok = true) {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) process.exitCode = 1
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME_PATH })
  // One shared context/storage across both passes — a fresh browser.newPage()
  // would silently spin up an isolated incognito context with no data, which
  // is exactly what broke the first version of this script's wide pass.
  const context = await browser.newContext({ hasTouch: true, isMobile: true })

  // ── PHONE PASS ──────────────────────────────────────────────────────
  {
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    page.on('pageerror', (e) => log(`no page error: ${e.message}`, false))
    await page.goto(BASE)
    await page.waitForSelector('text=The Grimoire')

    // Create project
    await page.click('button[aria-label="Create new project"]')
    await page.fill('#new-project-title', 'Smoke Test Novel')
    await page.click('button:has-text("Add to Shelf")')
    await page.waitForSelector('text=Smoke Test Novel')
    await page.click('button[aria-label^="Open Smoke Test Novel"]')
    await page.waitForSelector('text=+ New Entry')
    log('project created and opened')

    // Create a scene
    await page.getByRole('button', { name: '+ New Entry', exact: true }).click()
    let dialog = page.locator('[role="dialog"]')
    await dialog.getByText('Scene-type', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Scene', exact: true }).click()
    await page.fill('#entry-title', 'The Opening')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await page.waitForSelector('text=1 — The Opening')
    log('scene created, marker numbered correctly')

    // Open the scene, then a text card
    await page.click('text=1 — The Opening')
    await page.click('text=Continue')
    await page.waitForSelector('text=Edit Entry')
    await page.click('text=Actions')
    await page.waitForSelector('textarea')
    log('reached FullCardView editor')

    // Onboarding hint should show (first ever field opened)
    const hintVisible = await page.isVisible('text=to link a person, place, or thing')
    log('onboarding hint appears on first field open', hintVisible)
    if (hintVisible) await page.click('button:has-text("Got it")')

    // Bracket-link a brand-new entry
    const textarea = page.locator('textarea')
    await textarea.click()
    await textarea.type('Elara drew her sword. [[Elara', { delay: 15 })
    await page.waitForTimeout(300)
    const newElaraBtn = page.getByRole('button', { name: '+ New Entry: "Elara"', exact: true })
    await newElaraBtn.waitFor()
    await newElaraBtn.click({ timeout: 5000 })
    await page.waitForSelector('text=What is this?')
    await page.getByRole('button', { name: 'Person', exact: true }).click()
    await page.waitForTimeout(600) // let debounce flush
    log('new entry created via [[ dropdown + classification modal')

    // REGRESSION: createEntry() dispatches ADD_INDEX_ENTRY and then, in the
    // same synchronous handler, calls completeLink() -> commit(), which
    // arms a 400ms debounced save. That debounce closure used to read
    // dataset.indexEntries directly, which (thanks to React batching) was
    // still the PRE-dispatch snapshot — friendlyToRaw() couldn't find the
    // entry that was just created, so it silently left "[[Elara]]" as
    // plain unresolved text in the persisted raw field instead of a real
    // "[[@id|Elara]]" token. It self-healed on any later touch of the
    // field (which is why normal use — and every earlier test here that
    // keeps typing or navigates away — never caught it), so the only way
    // to see the wrong value is to read IndexedDB directly RIGHT NOW,
    // before anything else touches this field.
    const persistedRightAfterCreate = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('keyval-store')
          req.onsuccess = () => {
            const tx = req.result.transaction('keyval', 'readonly')
            const getReq = tx.objectStore('keyval').get('grimoire-dataset-v1')
            getReq.onsuccess = () => resolve(getReq.result)
            getReq.onerror = () => reject(getReq.error)
          }
          req.onerror = () => reject(req.error)
        }),
    )
    const openingScene = persistedRightAfterCreate.scenes.find((s) => s.title === 'The Opening')
    const resolvedImmediately = /\[\[@[^|]+\|Elara\]\]/.test(openingScene?.actions ?? '')
    log(
      'newly-created link resolves into a real [[@id|...]] token in IndexedDB immediately (no race with the debounced save)',
      resolvedImmediately,
    )

    // Add more text referencing the same alias to test collision "same thing"
    await textarea.click()
    await page.keyboard.press('End')
    await textarea.type(' Then [[Elara Voss', { delay: 15 })
    await page.waitForTimeout(300)
    const newElaraVossBtn = page.getByRole('button', { name: '+ New Entry: "Elara Voss"', exact: true })
    await newElaraVossBtn.waitFor()
    await newElaraVossBtn.click({ timeout: 5000 })
    await page.waitForSelector('text=What is this?')
    await page.getByRole('button', { name: 'Person', exact: true }).click()
    await page.waitForTimeout(600)
    log('second distinct entry "Elara Voss" created (no false collision)')

    // Now type something that DOES exactly collide with "Elara"
    await textarea.click()
    await page.keyboard.press('End')
    await textarea.type(' Later, [[Elara', { delay: 15 })
    await page.waitForTimeout(300)
    const newElaraBtn2 = page.getByRole('button', { name: '+ New Entry: "Elara"', exact: true })
    await newElaraBtn2.waitFor()
    await newElaraBtn2.click({ timeout: 5000 })
    const collisionShown = await page.isVisible('text=This name is already in the Index')
    log('duplicate-name collision modal triggers on exact match', collisionShown)
    await page
      .getByRole('button', { name: 'Same thing — link "Elara" as another name for Elara', exact: true })
      .click()
    await page.waitForTimeout(600)
    log('collision resolved via "Same thing" (alias)')

    // Full "Preview rendered links" view on FullCardView itself — the editor
    // textarea can never show colored/brackets-hidden text (it's a plain
    // <textarea>), and the scene-card snippet truncates to 2 lines, so this
    // toggle is the only place the WHOLE field's at-rest rendering is checkable.
    await page.click('text=Preview rendered links')
    await page.waitForTimeout(100)
    const previewBox = page.locator('.whitespace-pre-wrap').first()
    const previewInner = await previewBox.innerText()
    const previewHidesBrackets = !previewInner.includes('[[') && !previewInner.includes('@')
    const previewGreenCount = await previewBox.locator('.text-link').count()
    log(
      'FullCardView "Preview" shows the FULL card at-rest (brackets hidden, green links), not just a 2-line snippet',
      previewHidesBrackets && previewGreenCount >= 3,
    )
    await page.click('text=Back to editing')
    await page.waitForSelector('textarea')
    log('"Back to editing" returns to the plain-bracket editable textarea')

    // Go back to Scene page, verify LinkedText renders resolved links (green, no brackets) in the peek
    await page.click('button[aria-label="Back"]')
    await page.waitForSelector('text=Edit Entry')
    const actionsPreview = page.locator('[role="button"]:has-text("Actions")').first()
    const previewText = await actionsPreview.innerText()
    const noRawBrackets = !previewText.includes('[[') && !previewText.includes('@')
    log('at-rest preview hides raw bracket/id syntax', noRawBrackets)
    const hasGreenLink = await actionsPreview.locator('.text-link').count()
    log('at-rest preview renders resolved links in malachite green (LinkedText wired up)', hasGreenLink > 0)

    // REGRESSION: the Table of Contents "peek popup" (tap a scene row on
    // phone -> quick-preview modal with Continue/Cancel, shown BEFORE
    // navigating into the full scene) used to render peekScene.summary as
    // raw text directly, bypassing LinkedText entirely — a user caught this
    // live, seeing literal "[[@<uuid>|Name]]" token syntax in the popup.
    // Fixed by routing it through the same LinkedText component every other
    // at-rest view uses. Link the Summary field to the existing "Elara"
    // entry, then back all the way out to the Table of Contents list and
    // re-open the peek popup (not the full scene) to check its rendering.
    await page.click('text=Summary')
    await page.waitForSelector('textarea')
    const summaryTextarea = page.locator('textarea')
    await summaryTextarea.click()
    await summaryTextarea.type('They spoke of [[Elara', { delay: 15 })
    await page.waitForTimeout(300)
    await page.getByText('Elara', { exact: true }).click()
    await page.waitForTimeout(600)
    await summaryTextarea.click()
    await page.keyboard.press('End')
    await summaryTextarea.type(' at the gate.', { delay: 15 })
    await page.waitForTimeout(600)
    log('Summary field linked to existing "Elara" entry via [[ dropdown')

    await page.click('button[aria-label="Back"]')
    await page.waitForSelector('text=Edit Entry')
    await page.click('button[aria-label="Back"]')
    await page.waitForSelector('text=+ New Entry')
    await page.click('text=1 — The Opening')
    await page.waitForSelector('text=Continue')
    const peekBody = page.locator('.whitespace-pre-wrap').first()
    const peekText = await peekBody.innerText()
    const peekHidesRawTokens = !peekText.includes('[[') && !peekText.includes('@')
    log('peek popup summary hides raw bracket/id token syntax', peekHidesRawTokens)
    const peekGreenLinks = await peekBody.locator('.text-link').count()
    log('peek popup summary renders resolved links in malachite green (LinkedText wired up)', peekGreenLinks > 0)
    await page.click('text=Continue')
    await page.waitForSelector('text=Edit Entry')

    // "Show more" on a scene card expands the clipped preview in place —
    // must NOT navigate away to FullCardView (that's a separate, real
    // <button> nested beside the card's own tap target, stopping propagation).
    await actionsPreview.getByRole('button', { name: 'Show more', exact: false }).click()
    await page.waitForTimeout(100)
    const stillOnSceneDetail = await page.isVisible('text=Edit Entry')
    const expandedClampGone = !(await actionsPreview.locator('.line-clamp-2').count())
    log(
      '"Show more" expands the card in place without navigating to the editor',
      stillOnSceneDetail && expandedClampGone,
    )
    await actionsPreview.getByRole('button', { name: 'Show less', exact: false }).click()
    await page.waitForTimeout(100)
    const reclampedAfterShowLess = await actionsPreview.locator('.line-clamp-2').count()
    log('"Show less" re-clips the card back down', reclampedAfterShowLess > 0)

    // Check Index screen population
    await page.click('button[aria-label="Open Index"]')
    await page.waitForSelector('text=People')
    await page.waitForTimeout(200)
    // Entry-row buttons also contain a trailing "›" affordance glyph, so the
    // accessible NAME isn't a bare "Elara" — match on the name span's exact
    // text instead (unambiguous vs. "Elara Voss") and let the click bubble.
    const hasElara = await page.getByText('Elara', { exact: true }).isVisible()
    log('Index screen shows the linked entry under People', hasElara)
    await page.getByText('Elara', { exact: true }).click()
    await page.waitForSelector('text=Appears In')
    const appearsIn = await page.innerText('body')
    const showsScene = appearsIn.includes('The Opening')
    log('Index entry detail lists the scene it appears in', showsScene)

    // Close this modal, rename "Elara Voss" via the Index, then confirm the scene
    // text still reads "Elara Voss" verbatim (alias/typed text preserved on rename,
    // not swapped for the new canonical name) and the link stays resolved (green).
    // Modal has no Escape/close-button handler — click the backdrop (outside
    // the centered card) to dismiss it, same as a real user would.
    await page.locator('[role="dialog"]').click({ position: { x: 5, y: 820 } })
    await page.waitForTimeout(200)
    await page.getByText('Elara Voss', { exact: true }).click()
    await page.waitForSelector('text=Appears In')
    await page.locator('[aria-label="Elara Voss"]').getByRole('button', { name: 'Rename', exact: true }).click()
    const renameInput = page.locator('[aria-label="Elara Voss"] form').first().getByRole('textbox')
    await renameInput.fill('Voss Sterling')
    await page.locator('[aria-label="Elara Voss"]').getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(300)
    // Modal has no Escape/close-button handler — click the backdrop (outside
    // the centered card) to dismiss it, same as a real user would.
    await page.locator('[role="dialog"]').click({ position: { x: 5, y: 820 } })
    await page.waitForTimeout(200)

    // The Index screen's own Back button is a fixed shortcut to the project's
    // Table of Contents (not history-based) — use browser-back to actually
    // return to the scene we came from, same as a real back gesture would.
    await page.goBack()
    await page.waitForSelector('text=Edit Entry')
    const previewAfterRename = await page.locator('[role="button"]:has-text("Actions")').first().innerText()
    log(
      'renaming an entry preserves already-typed alias text in prose ("Elara Voss" stays, not "Voss Sterling")',
      previewAfterRename.includes('Elara Voss') && !previewAfterRename.includes('Voss Sterling'),
    )
    const stillLinkStyled = await page
      .locator('[role="button"]:has-text("Actions") .text-link:has-text("Elara Voss")')
      .isVisible()
    log("renamed entry's old-name mention is still styled as a resolved link, not degraded", stillLinkStyled)

    await page.click('button[aria-label="Open Index"]')
    await page.waitForSelector('text=People')
    await page.waitForTimeout(200)
    await page.getByText('Elara', { exact: true }).click()
    await page.waitForSelector('text=Appears In')

    // Delete the entry, verify graceful degrade back on the scene
    await page.locator('[aria-label="Elara"]').getByRole('button', { name: 'Delete', exact: true }).click()
    await page.waitForSelector('text=Delete this Index entry?')
    await page
      .locator('[aria-label="Delete this Index entry?"]')
      .getByRole('button', { name: 'Delete', exact: true })
      .click()
    await page.waitForTimeout(300)
    log('index entry deleted')

    await page.goBack()
    await page.waitForSelector('text=Edit Entry')
    await page.click('text=Actions')
    await page.waitForSelector('textarea')
    const raw = await page.locator('textarea').inputValue()
    log('deleted entry link degrades to plain [[Elara]] bracket text in editor', raw.includes('[[Elara]]'))

    // Planned scene flow
    await page.locator('button[aria-label="Back"]').click()
    await page.locator('button[aria-label="Back"]').click()
    await page.waitForSelector('text=+ Plan Next Scene')
    await page.getByRole('button', { name: '+ Plan Next Scene', exact: true }).click()
    dialog = page.locator('[role="dialog"]')
    await dialog.getByText('Scene-type', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Scene', exact: true }).click()
    await page.fill('#entry-title', 'The Confrontation')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await page.waitForSelector('text=Planned')
    log('planned scene created and shows (Planned) badge in TOC')

    await page.click('text=The Confrontation')
    await page.click('text=Continue')
    await page.waitForSelector('text=Mark as Written')
    await page.getByRole('button', { name: 'Mark as Written', exact: true }).click()
    await page.waitForSelector('text=Confirm the final number and title')
    dialog = page.locator('[role="dialog"]')
    await dialog.getByRole('button', { name: 'Mark as Written', exact: true }).click()
    await page.waitForTimeout(300)
    const stillPlanned = await page.isVisible('text=Planned')
    log('scene converts to written (Planned badge gone) via Mark as Written', !stillPlanned)

    await page.close()
  }

  // ── TOUCH REGRESSION PASS ───────────────────────────────────────────
  // Reproduces the real bug report: on an actual touchscreen, tapping the
  // "+ New Entry" dropdown option did nothing at all — the textarea's blur
  // (which a real touch tap DOES trigger, unlike a synthetic mouse click)
  // raced a 150ms auto-close timer and could unmount the dropdown before
  // the tap's click event reached the button. .tap() below dispatches real
  // touch events (not mouse events), which .click() would not exercise.
  {
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE)
    await page.waitForSelector('text=The Grimoire')

    await page.getByRole('button', { name: 'Create new project' }).tap()
    await page.fill('#new-project-title', 'Touch Test Novel')
    await page.getByRole('button', { name: 'Add to Shelf', exact: true }).tap()
    await page.waitForSelector('text=Touch Test Novel')
    await page.getByRole('button', { name: /^Open Touch Test Novel/ }).tap()
    await page.waitForSelector('text=+ New Entry')

    await page.getByRole('button', { name: '+ New Entry', exact: true }).tap()
    let dialog = page.locator('[role="dialog"]')
    await dialog.getByText('Scene-type', { exact: true }).tap()
    await dialog.getByRole('button', { name: 'Scene', exact: true }).tap()
    await page.fill('#entry-title', 'Touch Scene')
    await dialog.getByRole('button', { name: 'Create', exact: true }).tap()
    await page.waitForSelector('text=1 — Touch Scene')

    await page.getByText('1 — Touch Scene', { exact: true }).tap()
    await page.getByRole('button', { name: 'Continue', exact: true }).tap()
    await page.waitForSelector('text=Edit Entry')
    await page.getByText('Actions', { exact: true }).tap()
    await page.waitForSelector('textarea')
    if (await page.isVisible('text=Got it')) await page.getByRole('button', { name: 'Got it', exact: true }).tap()

    const touchTextarea = page.locator('textarea')
    await touchTextarea.tap()
    await touchTextarea.type('The old caretaker, [[Rennick', { delay: 15 })
    await page.waitForTimeout(300)
    const touchNewEntryBtn = page.getByRole('button', { name: '+ New Entry: "Rennick"', exact: true })
    await touchNewEntryBtn.waitFor()
    await touchNewEntryBtn.tap()
    const classifyShown = await page.isVisible('text=What is this?')
    log('TOUCH: tapping "+ New Entry" on a real touch tap opens the classification modal (not silently ignored)', classifyShown)
    await page.getByRole('button', { name: 'Person', exact: true }).tap()
    await page.waitForTimeout(600)
    const afterCreate = await touchTextarea.inputValue()
    log('TOUCH: link actually gets inserted into the field text (not left as raw "[[Rennick")', afterCreate.includes('[[Rennick]]'))

    // Now back up into the just-created link with real backspaces and confirm
    // the dropdown re-triggers cleanly (no stray "]" in the query) as soon as
    // both closing brackets are gone — the "reopen while deleting" behavior.
    await touchTextarea.tap()
    await page.keyboard.press('End') // cursor lands right after the just-inserted "]]" — nothing typed after it
    await page.keyboard.press('Backspace') // remove the 2nd ]  -> "...Rennick]" — one bracket still pending, no trigger yet
    await page.waitForTimeout(150)
    const noStrayBracketQuery = !(await page.isVisible('text=+ New Entry: "Rennick]"'))
    await page.keyboard.press('Backspace') // remove the 1st ]  -> "...Rennick" — both brackets clear, should re-trigger now
    await page.waitForTimeout(150)
    const reopenedClean = await page
      .getByRole('button', { name: '+ New Entry: "Rennick"', exact: true })
      .isVisible()
    log(
      'backspacing through a linked word\'s closing brackets re-opens the dropdown cleanly (no stray "]" in the query)',
      noStrayBracketQuery && reopenedClean,
    )

    await page.close()
  }

  // ── IMPORT/EXPORT PASS ──────────────────────────────────────────────
  // Covers: export reliability (single reliable download, no cross-talk
  // with Import), and itemized per-conflict import resolution with a
  // visible before/after diff, individual choices, and "Apply to all."
  {
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE)
    await page.waitForSelector('text=The Grimoire')

    await page.click('button[aria-label="Create new project"]')
    await page.fill('#new-project-title', 'Conflict Test Novel')
    await page.click('button:has-text("Add to Shelf")')
    await page.waitForSelector('text=Conflict Test Novel')
    await page.click('button[aria-label^="Open Conflict Test Novel"]')
    await page.waitForSelector('text=+ New Entry')

    async function createScene(title) {
      await page.getByRole('button', { name: '+ New Entry', exact: true }).click()
      const dlg = page.locator('[role="dialog"]')
      await dlg.getByText('Scene-type', { exact: true }).click()
      await dlg.getByRole('button', { name: 'Scene', exact: true }).click()
      await page.fill('#entry-title', title)
      await dlg.getByRole('button', { name: 'Create', exact: true }).click()
      await page.waitForTimeout(150)
    }
    await createScene('Scene One')
    await createScene('Scene Two')
    await page.waitForSelector('text=2 — Scene Two')

    async function setSummary(sceneHeadingText, text) {
      await page.getByText(sceneHeadingText, { exact: true }).click()
      await page.click('text=Continue')
      await page.waitForSelector('text=Edit Entry')
      await page.click('text=Summary')
      await page.waitForSelector('textarea')
      const ta = page.locator('textarea')
      await ta.click()
      await ta.fill(text)
      await page.waitForTimeout(600)
      await page.click('button[aria-label="Back"]')
      await page.waitForSelector('text=Edit Entry')
      await page.locator('button[aria-label="Back"]').click()
      await page.waitForSelector('text=+ New Entry')
    }
    await setSummary('1 — Scene One', 'Original A')
    await setSummary('2 — Scene Two', 'Original B')

    // Export the "original" baseline.
    await page.click('button[aria-label="Settings"]')
    await page.waitForSelector('text=Data Backup')

    // EXPORT RELIABILITY: a rapid double-tap should still yield exactly
    // ONE download and a visible success message — not a silent failure
    // that invites repeated tapping, and no cross-talk with Import.
    const downloads = []
    page.on('download', (d) => downloads.push(d))
    await page.click('button:has-text("Export Data")')
    await page.click('button:has-text("Export Data")')
    await page.waitForTimeout(1000)
    log('export shows a visible success message (not silent)', await page.isVisible('text=Exported grimoire-export'))
    log('rapid double-tap on Export produces exactly one download (re-entrancy guarded)', downloads.length === 1)

    const tmpPath = '/tmp/grimoire-conflict-baseline.json'
    await downloads[0].saveAs(tmpPath)

    // Diverge LOCAL data from that baseline: edit both scene summaries and
    // rename the project, so re-importing the baseline creates 3 conflicts.
    await page.click('button[aria-label="Back"]')
    await page.waitForSelector('text=+ New Entry')
    await setSummary('1 — Scene One', 'Local A edited')
    await setSummary('2 — Scene Two', 'Local B edited')

    await page.getByRole('button', { name: 'Rename', exact: true }).click()
    await page.waitForSelector('text=Rename Project')
    const renameField = page.locator('input').first()
    await renameField.fill('Conflict Test Novel (local)')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(200)

    // Re-import the original baseline — should now show 3 itemized conflicts.
    await page.click('button[aria-label="Settings"]')
    await page.waitForSelector('text=Data Backup')
    await page.setInputFiles('input[type="file"]', tmpPath)
    await page.waitForSelector('text=Import Data')
    const conflictModalText = await page.innerText('[role="dialog"]')
    const listsAllThreeByName =
      conflictModalText.includes('Scene One') &&
      conflictModalText.includes('Scene Two') &&
      conflictModalText.includes('Conflict Test Novel (local)')
    log('conflicting items are listed individually by name, not just a count', listsAllThreeByName)
    const showsDiffContent = conflictModalText.includes('Local A edited') && conflictModalText.includes('Original A')
    log('each conflict shows the actual differing local vs. imported content', showsDiffContent)

    // Apply "Keep Imported" to all, then individually override Scene One
    // back to "Keep Local" — proves per-item control still works after a
    // bulk shortcut, not just as an alternative to it.
    await page.getByRole('button', { name: 'Keep Imported', exact: true }).click()
    await page.waitForTimeout(100)
    const sceneOneConflictCard = page.locator('.bg-canvas.p-3', { hasText: 'Scene One' })
    await sceneOneConflictCard.getByText('Keep Local', { exact: true }).click()
    await page.waitForTimeout(100)

    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await page.waitForTimeout(400)

    // Settings' own Back returns via history, to whichever project page we
    // came from.
    await page.click('button[aria-label="Back"]')
    await page.waitForSelector('text=+ New Entry')
    const headerTitleAfterImport = await page.locator('h1').innerText()
    log(
      '"Apply to all: Keep Imported" resolved the untouched project-title conflict',
      headerTitleAfterImport === 'Conflict Test Novel',
    )

    await page.waitForSelector('text=1 — Scene One')
    await page.getByText('1 — Scene One', { exact: true }).click()
    await page.click('text=Continue')
    await page.waitForSelector('text=Edit Entry')
    const scene1Summary = await page.locator('[role="button"]:has-text("Summary")').first().innerText()
    log('individually-overridden item ("Keep Local") kept the local text', scene1Summary.includes('Local A edited'))

    await page.locator('button[aria-label="Back"]').click()
    await page.waitForSelector('text=+ New Entry')
    await page.getByText('2 — Scene Two', { exact: true }).click()
    await page.click('text=Continue')
    await page.waitForSelector('text=Edit Entry')
    const scene2Summary = await page.locator('[role="button"]:has-text("Summary")').first().innerText()
    log('bulk "Keep Imported" item took the imported text', scene2Summary.includes('Original B'))

    await page.close()
  }

  // ── FEATURE PASS ─────────────────────────────────────────────────────
  // Connection notes, dropdown-vs-keyboard shrink, and Index search.
  {
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE)
    await page.waitForSelector('text=The Grimoire')

    // ── Connection notes ──
    await page.waitForSelector('text=Conflict Test Novel')
    await page.click('button[aria-label^="Open Conflict Test Novel"]')
    await page.waitForSelector('text=1 — Scene One')
    await page.getByText('1 — Scene One', { exact: true }).click()
    await page.click('text=Continue')
    await page.waitForSelector('text=Edit Entry')

    await page.getByText('+ Add', { exact: true }).click()
    await page.waitForSelector('text=Connect to Scene')
    await page.getByText('2 — Scene Two', { exact: true }).click()
    await page.waitForSelector('text=Describe the Connection')
    await page.fill('#connection-note', 'They meet here for the first time')
    await page.getByRole('button', { name: 'Add Connection', exact: true }).click()
    await page.waitForTimeout(200)

    const connectionNoteVisible = await page.isVisible('text=They meet here for the first time')
    log('connection note displays alongside the connected scene', connectionNoteVisible)

    await page.getByText('Edit note', { exact: true }).click()
    await page.waitForSelector('text=Connection Note')
    const noteField = page.locator('textarea').first()
    await noteField.fill('They meet here for the first time — and it goes badly')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(200)
    log(
      'connection note is editable after creation',
      await page.isVisible('text=They meet here for the first time — and it goes badly'),
    )

    // ── Dropdown-vs-keyboard shrink ──
    await page.click('text=Actions')
    await page.waitForSelector('textarea')
    const fieldTextarea = page.locator('textarea')
    const heightBefore = (await fieldTextarea.boundingBox())?.height ?? 0
    await fieldTextarea.click()
    await fieldTextarea.type('[[', { delay: 10 })
    await page.waitForTimeout(150)
    const heightAfter = (await fieldTextarea.boundingBox())?.height ?? 0
    log(
      'text field visibly shrinks while the [[ suggestion panel is open (so it can peek above the keyboard)',
      heightAfter < heightBefore * 0.7,
    )
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(150)
    const heightRestored = (await fieldTextarea.boundingBox())?.height ?? 0
    log('text field returns to normal height once the panel closes', heightRestored >= heightBefore * 0.9)

    await page.locator('button[aria-label="Back"]').click()
    await page.waitForSelector('text=Edit Entry')
    await page.locator('button[aria-label="Back"]').click()
    await page.waitForSelector('text=+ New Entry')

    // ── Index search ──
    await page.locator('button[aria-label="Back"]').click()
    await page.waitForSelector('text=The Grimoire')

    await page.click('button[aria-label="Create new project"]')
    await page.fill('#new-project-title', 'Search Test Novel')
    await page.click('button:has-text("Add to Shelf")')
    await page.waitForSelector('text=Search Test Novel')
    await page.click('button[aria-label^="Open Search Test Novel"]')
    await page.waitForSelector('text=+ New Entry')

    await page.getByRole('button', { name: '+ New Entry', exact: true }).click()
    let dlg = page.locator('[role="dialog"]')
    await dlg.getByText('Scene-type', { exact: true }).click()
    await dlg.getByRole('button', { name: 'Scene', exact: true }).click()
    await page.fill('#entry-title', 'Search Scene')
    await dlg.getByRole('button', { name: 'Create', exact: true }).click()
    await page.waitForSelector('text=1 — Search Scene')

    await page.getByText('1 — Search Scene', { exact: true }).click()
    await page.click('text=Continue')
    await page.waitForSelector('text=Edit Entry')
    await page.click('text=Actions')
    await page.waitForSelector('textarea')
    if (await page.isVisible('text=Got it')) await page.click('button:has-text("Got it")')

    const searchTa = page.locator('textarea')
    await searchTa.click()
    await searchTa.type('The keeper [[Thornwood', { delay: 10 })
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '+ New Entry: "Thornwood"', exact: true }).click()
    await page.waitForSelector('text=What is this?')
    await page.getByRole('button', { name: 'Person', exact: true }).click()
    await page.waitForTimeout(500)

    await searchTa.click()
    await page.keyboard.press('End')
    await searchTa.type(' near [[Ashcombe', { delay: 10 })
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '+ New Entry: "Ashcombe"', exact: true }).click()
    await page.waitForSelector('text=What is this?')
    await page.getByRole('button', { name: 'Place', exact: true }).click()
    await page.waitForTimeout(500)

    await page.locator('button[aria-label="Back"]').click()
    await page.waitForSelector('text=Edit Entry')

    // Add "Thorny" as an alias for Thornwood via the Index.
    await page.click('button[aria-label="Open Index"]')
    await page.waitForSelector('text=People')
    await page.getByText('Thornwood', { exact: true }).click()
    await page.waitForSelector('text=Appears In')
    await page.fill('input[placeholder="Add another name…"]', 'Thorny')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForTimeout(200)
    await page.locator('[role="dialog"]').click({ position: { x: 5, y: 820 } })
    await page.waitForTimeout(200)

    // Search by the ALIAS, not the canonical name.
    await page.fill('input[aria-label="Search the Index"]', 'Thorny')
    await page.waitForTimeout(150)
    const thornwoodSurfacesByAlias = await page.getByText('Thornwood', { exact: true }).isVisible()
    log('searching an alias (not the canonical name) still surfaces the right entry', thornwoodSurfacesByAlias)
    const placesHiddenWhenNoMatch = !(await page.isVisible('text=Places'))
    const ashcombeHidden = !(await page.isVisible('text=Ashcombe'))
    log(
      'a search matching only one category hides the other (now-empty) category headers',
      placesHiddenWhenNoMatch && ashcombeHidden,
    )

    await page.fill('input[aria-label="Search the Index"]', '')
    await page.waitForTimeout(150)
    const bothCategoriesBack = (await page.isVisible('text=People')) && (await page.isVisible('text=Places'))
    log('clearing search returns to the full browsable view', bothCategoriesBack)

    await page.close()
  }

  // ── HEADING PASS ─────────────────────────────────────────────────────
  // "##" heading rendering, AND an explicit re-check that bracket-linking
  // (dropdown, existing-entry resolution, green at-rest rendering) still
  // works identically in a field that also contains "##" lines — both
  // systems parse the same live keystrokes, so this is tested directly
  // rather than assumed safe.
  {
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE)
    await page.waitForSelector('text=The Grimoire')

    await page.waitForSelector('text=Search Test Novel')
    await page.click('button[aria-label^="Open Search Test Novel"]')
    await page.waitForSelector('text=+ New Entry')

    await page.getByRole('button', { name: '+ New Entry', exact: true }).click()
    const dlg = page.locator('[role="dialog"]')
    await dlg.getByText('Scene-type', { exact: true }).click()
    await dlg.getByRole('button', { name: 'Scene', exact: true }).click()
    await page.fill('#entry-title', 'Heading Scene')
    await dlg.getByRole('button', { name: 'Create', exact: true }).click()
    await page.waitForSelector('text=2 — Heading Scene')

    await page.getByText('2 — Heading Scene', { exact: true }).click()
    await page.click('text=Continue')
    await page.waitForSelector('text=Edit Entry')
    await page.click('text=Time')
    await page.waitForSelector('textarea')

    const headingTa = page.locator('textarea')
    await headingTa.click()
    // No space after "##", matching the exact form from the bug report.
    await headingTa.type('##Day - zero.\nQuiet morning. [[Thornwood', { delay: 10 })
    await page.waitForTimeout(300)
    // Thornwood already exists (created in the earlier Index-search test) —
    // this should offer it as an EXISTING suggestion, not "+ New Entry",
    // proving the bracket-link dropdown still recognizes existing entries
    // normally in a field that also contains a "##" line. getByText (not
    // getByRole) because the suggestion button's accessible name also
    // concatenates its type-label span ("Thornwood Person").
    const existingSuggestion = page.getByText('Thornwood', { exact: true })
    const suggestionShown = await existingSuggestion.isVisible().catch(() => false)
    log('bracket-link dropdown still offers an existing entry match in a field containing "##" text', suggestionShown)
    await existingSuggestion.click()
    // Settle after picking — the click resolves before React has necessarily
    // committed the textarea's new value, and pressing End + typing in the
    // same tick as a real user never would raced that re-render, scrambling
    // the field. Same settle time used elsewhere in this suite after a
    // dropdown pick (e.g. the "+ New Entry" flow's post-classification wait).
    await page.waitForTimeout(200)
    await page.keyboard.press('End')
    await headingTa.type('\n##Day - one.\nStill here.', { delay: 10 })
    await page.waitForTimeout(600)

    await page.click('text=Preview rendered links')
    await page.waitForTimeout(150)
    const previewBox = page.locator('.whitespace-pre-wrap').first()
    const headingEls = previewBox.locator('.font-heading')
    const headingTexts = await headingEls.allInnerTexts()
    log(
      '"##" lines render as distinct headings, one per line, with the marker stripped',
      headingTexts.some((t) => t.trim() === 'Day - zero.') && headingTexts.some((t) => t.trim() === 'Day - one.'),
    )
    const bodyText = await previewBox.innerText()
    log('non-heading lines stay plain body text (not styled as headings)', bodyText.includes('Quiet morning.') && bodyText.includes('Still here.'))
    const linkStillGreenNearHeadings = await previewBox.locator('.text-link:has-text("Thornwood")').count()
    log(
      'bracket-link still renders resolved (green) at rest in a field that also has "##" headings',
      linkStillGreenNearHeadings > 0,
    )
    // REGRESSION: a "##Label- value" heading line must itself split into two
    // colors — the label (with its dash) in malachite green, the value
    // after the dash in gold — not the whole line one flat color. "Day -
    // zero." should read as green "Day -" + gold " zero.".
    const firstHeading = headingEls.first()
    const labelSpan = firstHeading.locator('.text-link').first()
    const valueSpan = firstHeading.locator('.text-gold').first()
    const labelText = (await labelSpan.innerText()).trim()
    const valueText = (await valueSpan.innerText()).trim()
    log(
      'heading line splits into a green label ("Day -") and a gold value ("zero.")',
      labelText === 'Day -' && valueText === 'zero.',
    )
    const labelColor = await labelSpan.evaluate((el) => getComputedStyle(el).color)
    const valueColor = await valueSpan.evaluate((el) => getComputedStyle(el).color)
    log('heading label and heading value render in genuinely different colors', labelColor !== valueColor)

    // Plain non-heading body lines (no "##", e.g. "Quiet morning...") should
    // read the same gold as a heading's value — body text is body text
    // whether or not it's the tail of a "##" line.
    const bodyLine = previewBox.locator('.text-gold', { hasText: 'Quiet morning.' }).first()
    const bodyLineFound = await bodyLine.count()
    log('non-heading body line also renders gold, matching a heading value\'s color', bodyLineFound > 0)

    await page.close()
  }

  // ── WIDE PASS ────────────────────────────────────────────────────────
  {
    const page = await context.newPage()
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.goto(BASE)
    await page.waitForSelector('text=Smoke Test Novel')
    await page.click('button[aria-label^="Open Smoke Test Novel"]')
    await page.waitForSelector('text=+ New Entry')

    const hasSpread = await page.isVisible('text=Select an entry from the Table of Contents to view it here.')
    log('wide viewport shows two-page spread empty state', hasSpread)

    await page.click('text=1 — The Opening')
    await page.waitForSelector('text=Edit Entry')
    const stillOnToc = page.url().includes('/project/') && !page.url().includes('/scene/')
    log('selecting an entry on wide screen swaps right pane without route navigation', stillOnToc)

    await page.close()
  }

  await browser.close()
  console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
