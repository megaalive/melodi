import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { readAppStyles } from "./helpers/read-app-styles.js";

// Modul yang menyentuh DOM saat diimpor tidak bisa di-load di Node, jadi hanya
// diperiksa sintaksnya lewat `npm run check`. Modul lain di bawah diimpor sungguhan
// supaya file rusak langsung gagal di suite, bukan hanya saat Check dijalankan manual.
const DOM_TOUCHING = new Set([
  "app.js",
  "ui/guitar-view.js",
  "ui/expression-lane.js",
  "ui/piano-roll.js",
  "ui/score.js",
]);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith(".js")) acc.push(full);
  }
  return acc;
}

const srcRoot = resolve("src");
const files = walk(srcRoot).map((full) => ({
  full,
  rel: full.slice(srcRoot.length + 1).replace(/\\/g, "/"),
}));

test("setiap modul yang tidak butuh DOM bisa diimpor di Node", async () => {
  const pure = files.filter((f) => !DOM_TOUCHING.has(f.rel)).map((f) => f.rel);
  assert.ok(pure.length >= 15, `hanya ${pure.length} modul murni, daftarnya mencurigakan`);

  for (const rel of pure) {
    const url = pathToFileURL(join(srcRoot, rel)).href;
    const mod = await import(url);
    assert.ok(mod, `${rel} gagal diimpor`);
  }
});

test("setiap import di dalam src menunjuk file yang benar-benar ada", () => {
  for (const { full, rel } of files) {
    const source = readFileSync(full, "utf8");
    const specifiers = [...source.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g)]
      .map((m) => m[1])
      .concat([...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]));

    for (const spec of specifiers) {
      if (!spec.startsWith(".")) {
        assert.ok(
          !/^[a-z@]/i.test(spec),
          `${rel} mengimpor paket "${spec}", proyek ini harus tetap tanpa dependency`
        );
        continue;
      }
      const target = resolve(dirname(full), spec.split(/[?#]/, 1)[0]);
      assert.ok(
        statSync(target, { throwIfNoEntry: false })?.isFile(),
        `${rel} mengimpor "${spec}" yang tidak ada`
      );
    }
  }
});

test("modul DOM di daftar pengecualian memang ada dan tetap ada di sana", () => {
  for (const rel of DOM_TOUCHING) {
    assert.ok(
      files.some((f) => f.rel === rel),
      `daftar DOM_TOUCHING menyebut "${rel}" yang tidak ada`
    );
  }
});

test("entry app and styles use the build token while the vendored script remains versioned", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const build = /<meta name="melodi-build" content="([^"]+)">/.exec(html)?.[1];
  assert.ok(build, "melodi-build harus ada");
  assert.ok(html.includes("styles/app.css?v=" + build));
  assert.match(html, /vendor\/abcjs\/abcjs-basic-min\.js\?v=[\w.-]+/);
  assert.ok(html.includes("src/app.js?v=" + build));

  const app = readFileSync(resolve("src/app.js"), "utf8");
  assert.ok(app.includes("./core/model.js?v=" + build));
  assert.ok(app.includes("./core/commands.js?v=" + build));
  assert.ok(app.includes("./core/runtime-state.js?v=" + build));
  assert.ok(app.includes("./i18n/messages.js?v=" + build));
  assert.ok(app.includes("./ui/score.js?v=" + build));
  assert.ok(app.includes("./storage/ui-preferences.js?v=" + build));
  assert.ok(app.includes("./ui/guitar-view.js?v=" + build));
  assert.ok(app.includes("./ui/guitar-tab.js?v=" + build));
  assert.ok(app.includes("./ui/drum-grid.js?v=" + build));
  assert.ok(app.includes("./ui/roll-follow.js?v=" + build));
  assert.ok(app.includes("./ui/percussion-expression.js?v=" + build));
  assert.ok(app.includes("./storage/draft.js?v=" + build));
  assert.ok(app.includes("./io/share.js?v=" + build));
  assert.ok(app.includes("./core/serialization.js?v=" + build));
  assert.ok(app.includes("./audio/player.js?v=" + build));
  assert.ok(app.includes("./ui/piano-roll.js?v=" + build));
  assert.doesNotMatch(app, /from\s+["']\.\/ui\/piano-roll\.js["']/);

  const expressionLane = readFileSync(resolve("src/ui/expression-lane.js"), "utf8");
  assert.ok(expressionLane.includes("./piano-roll.js?v=" + build));
  assert.doesNotMatch(expressionLane, /from\s+["']\.\/piano-roll\.js["']/);

  const commands = readFileSync(resolve("src/core/commands.js"), "utf8");
  const snapshot = readFileSync(resolve("src/core/snapshot.js"), "utf8");
  const serialization = readFileSync(resolve("src/core/serialization.js"), "utf8");
  const share = readFileSync(resolve("src/io/share.js"), "utf8");
  const draft = readFileSync(resolve("src/storage/draft.js"), "utf8");
  const drumGrid = readFileSync(resolve("src/ui/drum-grid.js"), "utf8");
  const percussionExpression = readFileSync(resolve("src/ui/percussion-expression.js"), "utf8");
  const player = readFileSync(resolve("src/audio/player.js"), "utf8");
  const transport = readFileSync(resolve("src/audio/transport.js"), "utf8");
  const percussionAudio = readFileSync(resolve("src/audio/percussion.js"), "utf8");
  assert.ok(commands.includes("./model.js?v=" + build));
  assert.ok(commands.includes("./snapshot.js?v=" + build));
  assert.ok(snapshot.includes("./model.js?v=" + build));
  assert.ok(serialization.includes("./model.js?v=" + build));
  assert.ok(share.includes("../core/model.js?v=" + build));
  assert.ok(draft.includes("../core/serialization.js?v=" + build));
  assert.ok(drumGrid.includes("../core/model.js?v=" + build));
  assert.ok(drumGrid.includes("../core/editor.js?v=" + build));
  assert.ok(drumGrid.includes("../instruments/percussion.js?v=" + build));
  assert.ok(percussionExpression.includes("../instruments/percussion.js?v=" + build));
  assert.ok(commands.includes("../audio/transport.js?v=" + build));
  assert.ok(player.includes("../core/model.js?v=" + build));
  assert.ok(player.includes("./transport.js?v=" + build));
  assert.ok(player.includes("./percussion.js?v=" + build));
  assert.ok(transport.includes("../core/model.js?v=" + build));
  assert.ok(percussionAudio.includes("../instruments/percussion.js?v=" + build));
});

test("Piano Roll dan Expression punya disclosure independen yang dapat diakses", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const preferences = readFileSync(resolve("src/storage/ui-preferences.js"), "utf8");

  assert.match(html, /id="piano-roll-collapse"[^>]*data-panel-collapse="pianoRoll"[^>]*aria-controls="piano-roll-content"[^>]*aria-expanded="true"/);
  assert.match(html, /id="expression-collapse"[^>]*data-panel-collapse="expression"[^>]*aria-controls="expression-content"[^>]*aria-expanded="true"/);
  assert.match(html, /id="piano-roll-content" class="panel-disclosure-content"/);
  assert.match(html, /id="expression-content" class="panel-disclosure-content"/);
  assert.match(html, /id="piano-roll-collapse-summary"[^>]*hidden/);
  assert.match(html, /id="expression-collapse-summary"[^>]*hidden/);
  assert.match(app, /content\.setAttribute\("aria-hidden", String\(collapsed\)\)/);
  assert.match(app, /content\.toggleAttribute\("inert", collapsed\)/);
  assert.match(app, /writeUiPreferences\(safeStorage\(\), uiPreferences\)/);
  assert.match(preferences, /pianoRollCollapsed:\s*false/);
  assert.match(preferences, /expressionCollapsed:\s*false/);
});

test("disclosure memakai chevron yang sama untuk Piano Roll, Expression, dan detail editor", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const css = readAppStyles();

  for (const id of ["piano-roll-collapse", "expression-collapse"]) {
    const start = html.indexOf(`id="${id}"`);
    const button = html.slice(start, html.indexOf("</button>", start));
    assert.match(button, /class="toolbar-icon disclosure-chevron"/);
  }

  for (const detailClass of ["bend-curve-editor", "expression-vibrato-details", "expression-note-details", "generation-options"]) {
    const start = html.indexOf(`class="${detailClass}"`);
    const fragment = html.slice(start, html.indexOf("</summary>", start));
    assert.match(fragment, /class="disclosure-summary"/);
    assert.match(fragment, /class="toolbar-icon disclosure-chevron"/);
  }

  assert.doesNotMatch(html, /collapse-chevron/);
  assert.match(css, /details:not\(\[open\]\) > \.disclosure-summary \.disclosure-chevron/);
  assert.match(css, /panel-collapse-button\[aria-expanded="false"\] \.disclosure-chevron/);
});

test("menu app meratakan project dan settings tanpa disclosure bersarang", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const css = readAppStyles();
  const studio = readFileSync(resolve("src/ui/studio.js"), "utf8");
  const roll = readFileSync(resolve("src/ui/piano-roll.js"), "utf8");
  const messages = readFileSync(resolve("src/i18n/messages.js"), "utf8");

  const headerStart = html.indexOf('<header class="page-header">');
  const headerEnd = html.indexOf("</header>", headerStart);
  const header = html.slice(headerStart, headerEnd);
  assert.match(header, /class="header-actions"/);
  assert.match(header, /id="project-menu" class="project-menu" data-aria-copy="appMenuLabel"/);
  assert.equal((header.match(/class="header-select-control"/g) ?? []).length, 2);
  assert.ok(header.indexOf('class="project-menu"') < header.indexOf('class="header-controls"'));
  assert.doesNotMatch(header, /<details class="studio-menu"|<details class="studio-settings"/);
  const menuStart = header.indexOf('class="project-menu-popover');
  const menuEnd = header.indexOf("</details>", menuStart);
  const projectMenu = header.slice(menuStart, menuEnd);
  for (const action of ["new-song", "show-examples", "show-browser-library", "save-browser-direct", "show-save-browser", "open-project-file", "save-project-file", "share-song", "command-palette", "language-switch", "theme-switch"]) {
    assert.match(projectMenu, new RegExp(`data-action="${action}"`));
  }
  assert.match(projectMenu, /aria-labelledby="app-settings-heading"/);
  assert.match(projectMenu, /data-sheet-close/);
  assert.match(header, /id="project-file-input" type="file"[^>]+hidden/);
  assert.match(css, /#project-menu\[open\]\s*\{\s*z-index:\s*45;/);
  assert.match(messages, /appMenuLabel:\s*"Menu"/);
  assert.match(messages, /projectActionsHeading:\s*"Proyek"/);
  assert.match(messages, /projectActionsHeading:\s*"Project"/);

  let detailsDepth = 0;
  let maximumDetailsDepth = 0;
  for (const [tag] of html.matchAll(/<\/?details\b[^>]*>/gi)) {
    if (tag.startsWith("</")) detailsDepth -= 1;
    else {
      detailsDepth += 1;
      maximumDetailsDepth = Math.max(maximumDetailsDepth, detailsDepth);
    }
  }
  assert.equal(maximumDetailsDepth, 1, "details elements do not nest in the source DOM");
  assert.doesNotMatch(studio, /morePopover\.append\(advanced\)/);
  assert.match(studio, /transportSettings\.append\(moreMenu\)/);
  assert.match(studio, /mobileDock\.append\(transportDock, modeNav\)/);
  assert.match(studio, /header\.insertBefore\(modeNav, headerActions\)/);
  assert.match(studio, /const directProjectActions = \['new-song', 'open-project-file', 'save-project-file', 'share-song'\]/);
  assert.match(studio, /headerActions\.append\(projectMenu, headerControls\)/);
  assert.match(studio, /const summaryKey = wide\.matches \? 'projectActionsHeading' : projectSummaryCopy/);
  assert.match(studio, /projectSummaryLabel\.dataset\.copy = summaryKey/);
  assert.match(studio, /const wide = matchMedia\('\(width >= 68rem\)'\)/);
  const toolbarActionsStart = html.indexOf('class="studio-toolbar-actions"');
  const panelSwitchesStart = html.indexOf('id="studio-panel-switches"');
  const moreStart = html.indexOf('<details class="studio-more"', toolbarActionsStart);
  const moreEnd = html.indexOf('</details>', moreStart);
  assert.ok(toolbarActionsStart >= 0 && toolbarActionsStart < panelSwitchesStart && panelSwitchesStart < moreStart);
  assert.doesNotMatch(html.slice(moreStart, moreEnd), /data-studio-panel=/);
  assert.match(html, /id="guitar-mode-toggle"[^>]*data-studio-view="guitar"[^>]*aria-pressed="false"/);
  assert.match(studio, /toolbarActions\.append\(rollCollapse\)/);
  assert.match(studio, /if \(compact\.matches\) mobileDock\.append\(panelSwitches\)/);
  assert.match(studio, /if \(!compact\.matches \|\| shortLandscapeLayout\) inspectorActions\.append\(panelSwitches\)/);
  assert.doesNotMatch(html, /<details class="pane-help"|class="pane-help-popover"/);
  assert.equal((html.match(/class="pane-help-trigger secondary"/g) ?? []).length, 2);
  assert.match(html, /<dialog id="context-help-dialog"[^>]*aria-labelledby="context-help-heading"/);
  assert.match(html, /data-copy="pianoRollHelp"/);
  assert.match(html, /data-copy="scoreHelp"/);
  assert.match(app, /target\.dataset\.action === "show-help"/);
  assert.match(app, /target\.dataset\.action === "close-help-dialog"/);

  const transport = html.indexOf('class="transport-action-group" role="group" data-aria-copy="transportControlsGroupLabel"');
  const settings = html.indexOf('class="playback-settings-group" role="group" data-aria-copy="playbackSettingsGroupLabel"');
  const view = html.indexOf('<nav id="studio-views" class="studio-views"');
  assert.ok(transport >= 0 && settings > transport && view > settings);
  const settingsGroup = html.slice(settings, view);
  assert.match(settingsGroup, /id="tempo-input"/);
  assert.match(settingsGroup, /id="loop-enabled"/);
  assert.match(settingsGroup, /class="transport-advanced-grid"/);
  assert.match(settingsGroup, /id="undo"[^>]*data-action="undo"/);
  assert.match(settingsGroup, /id="redo"[^>]*data-action="redo"/);
  assert.match(settingsGroup, /id="follow-mode"/);
  assert.doesNotMatch(html, /<select id="view-mode"/);
  assert.match(html, /id="studio-views"[^>]*data-entity="workspace-view"/);

  const editorToolbar = html.slice(html.indexOf('id="editor-toolbar"'), html.indexOf('id="piano-roll-content"'));
  for (const id of ["roll-tool-select", "roll-tool-draw", "snap-select", "roll-zoom"]) assert.ok(editorToolbar.includes(`id="${id}"`));
  assert.match(editorToolbar, /id="roll-selection-controls"[^>]*role="group"[^>]*hidden/);
  for (const action of ["copy-selection", "paste-notes", "clear-selection"]) assert.match(editorToolbar, new RegExp(`data-action="${action}"`));
  assert.match(editorToolbar, /data-focus-fallback="roll-tool-select"/);
  assert.match(app, /selectionControls\.hidden = !hasNoteSelection && !state\.selection/);
  assert.match(html, /id="harmony-timeline-tools"[^>]*contextual-roll-controls[^>]*hidden/);
  assert.match(html, /id="progression-workspace"[^>]*data-aria-copy="harmonyLaneLabel"/);
  assert.match(html, /id="harmony-tools-roll-home" hidden/);
  assert.match(roll, /commands\.setHarmonyRange\(Number\(bar\.dataset\.startTick\), Number\(bar\.dataset\.endTick\)\);\s*focusChordEditor\(\)/);
  assert.match(app, /function syncHarmonyToolsVisibility\(\)[\s\S]*?rollHome\.after\(harmonyTools\)[\s\S]*?harmonyTools\.hidden = !chordPanelActive/);
  assert.match(app, /const laneContextActive = rollVisible && panel === "none" && pianoRollHarmonyContextActive/);
  assert.match(app, /const chordPanelActive = panel === "chords"/);
  assert.match(app, /const rollVisible = Boolean\(rollSection && !rollSection\.hidden && rollContent && !rollContent\.hidden\)/);
  assert.match(app, /const focusedInRollTools = Boolean\(rollSection\?\.contains\(activeElement\) && harmonyTools\.contains\(activeElement\)\)/);
  assert.match(app, /focusin", \(event\) => \{\s*if \(isHarmonyLaneTarget\(event\.target\)\)/);
  assert.match(app, /if \(!contextStillFocused\) pianoRollHarmonyContextActive = false/);
  assert.match(app, /studioView\?\.render\(song, state\);\s*syncHarmonyToolsVisibility\(\);/);
  assert.match(app, /noteSelectionBar\.setAttribute\("role", "group"\)/);
  assert.match(app, /target\?\.closest\("\[data-studio-panel\], \[data-studio-close\]"\)/);
  assert.match(app, /queueMicrotask\(renderEditorControls\)/);
  const transportButtons = html.slice(html.indexOf('class="transport-buttons"'), html.indexOf('</div>', html.indexOf('class="transport-buttons"')));
  assert.match(transportButtons, /id="play"[^>]*data-action="play"[^>]*data-action-alias="pause"/);
  assert.match(transportButtons, /id="pause"[^>]*data-action="pause"[^>]*hidden/);
  assert.match(app, /if \(state\.playback\.status === "playing"\) run\(\(\) => commands\.pause\(\), "playbackPaused"\)/);
  assert.match(app, /playToggle\.dataset\.ariaCopy = playing \? "pauseButton" : "playButton"/);
  assert.match(app, /element\.setAttribute\("aria-label", label\)/);
  assert.match(app, /element\.setAttribute\("title", label\)/);

  const iconButtons = [...html.matchAll(/<button\b[^>]*class="[^"]*\bicon-button\b[^"]*"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.equal(iconButtons.length, 1, "header keeps one explicit icon button for the command palette; project actions use the direct desktop action group");
  for (const [, button] of iconButtons) {
    assert.match(button, /<svg[^>]*aria-hidden="true"/);
  }
  const iconTags = iconButtons.map(([tag]) => tag);
  for (const tag of iconTags) {
    assert.match(tag, /data-aria-copy=/);
    assert.doesNotMatch(tag, /tabindex="-1"/);
  }

  const shortcutButton = html.match(/<button\b[^>]*data-action="command-palette"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(shortcutButton);
  assert.match(shortcutButton[0], /data-aria-copy=/);
  assert.match(shortcutButton[1], /<svg[^>]*aria-hidden="true"/);
});

test("editor note dikonsolidasikan ke Expression tanpa popup kanan atas", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const css = readAppStyles();

  assert.doesNotMatch(html, /editor-note-actions|note-actions-label|note-bend-status/);
  assert.doesNotMatch(app, /editor-note-actions|note-actions-label|note-bend-status/);
  assert.doesNotMatch(css, /editor-note-actions|note-menu-status|note-menu-list/);

  const start = html.indexOf('<section id="expression-panel"');
  const end = html.indexOf("</section>", start);
  assert.ok(start >= 0 && end > start, "panel Expression harus ada");
  const panel = html.slice(start, end);
  assert.match(panel, /id="expression-note-details"/);
  assert.match(panel, /id="expression-bend-tools"/);
  assert.match(panel, /id="expression-vibrato-tools"/);
  assert.match(panel, /id="note-list"/);
  assert.match(panel, /data-action="set-selected-bend"/);
  assert.match(panel, /data-action="set-selected-vibrato"/);

  assert.doesNotMatch(app, /note-expression-details|note-expression-fields/);
  assert.match(app, /grid\.className = "form-grid expression-note-fields"/);
});

test("Score adalah editor canonical dengan Flow/Page dan shortcut yang benar-benar ditangani", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const score = readFileSync(resolve("src/ui/score.js"), "utf8");
  const css = readAppStyles();
  const preferences = readFileSync(resolve("src/storage/ui-preferences.js"), "utf8");

  const sectionStart = html.indexOf('<section id="score-section"');
  const sectionEnd = html.indexOf("</section>", sectionStart);
  const section = html.slice(sectionStart, sectionEnd);
  assert.match(section, /data-score-layout="flow"/);
  assert.match(section, /data-action="set-score-layout" data-score-layout="flow"/);
  assert.match(section, /data-action="set-score-layout" data-score-layout="page"/);
  assert.doesNotMatch(section, /score-sticky-context|score-context-(key|meter)/);

  assert.match(preferences, /scoreLayout:\s*"flow"/);
  assert.match(app, /scoreView\?\.setLayout\(layout\)/);
  assert.match(app, /commands\.updateNotes\(updates/);
  assert.match(app, /commands\.deleteNotes\(noteIds/);

  assert.match(score, /onTransposeNotes\(selectedIds/);
  assert.match(score, /onNudgeNotes\(selectedIds/);
  assert.match(score, /onDeleteNotes\(selectedIds/);
  assert.match(score, /event\.key === "ArrowUp"/);
  assert.match(score, /event\.altKey[\s\S]*event\.key === "ArrowLeft"/);
  assert.match(score, /event\.key === "Delete"/);
  assert.doesNotMatch(score, /Control\+D|Meta\+D/);

  assert.match(css, /score-scroll\[data-layout="flow"\]/);
  assert.match(css, /score-note\[data-selected="true"\]/);
});

test("Guitar memakai TAB dan Fretboard sebagai projection canonical yang sinkron", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const css = readAppStyles();
  const preferences = readFileSync(resolve("src/storage/ui-preferences.js"), "utf8");

  const start = html.indexOf('<section id="guitar-section"');
  const end = html.indexOf("</section>", start);
  const section = html.slice(start, end);
  assert.match(section, /data-guitar-layout="tab"/);
  assert.match(section, /id="guitar-layout-tab"[^>]*data-action="set-guitar-layout"/);
  assert.match(section, /id="guitar-layout-fretboard"[^>]*data-action="set-guitar-layout"/);
  assert.match(section, /id="guitar-tab-scroll"/);
  assert.match(section, /id="guitar-scroll"[^>]*hidden/);

  assert.match(preferences, /guitarLayout:\s*"tab"/);
  assert.match(app, /createGuitarTabView/);
  assert.match(app, /guitarTabView\?\.updateSelection/);
  assert.match(app, /guitarTabView\?\.updatePlayback/);
  assert.match(app, /target\.dataset\.action === "set-guitar-layout"/);

  assert.match(css, /\.guitar-tab-note\[data-selected="true"\]/);
  assert.match(css, /\.guitar-tab-note\[data-current="true"\]/);
  assert.match(css, /\.neck-bend-arc/);
  assert.match(css, /\.neck-vibrato-wave/);
});

test("Drums memakai Drum Grid canonical tanpa pitched Expression", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const css = readAppStyles();
  const runtime = readFileSync(resolve("src/core/runtime-state.js"), "utf8");
  const grid = readFileSync(resolve("src/ui/drum-grid.js"), "utf8");

  assert.match(html, /data-action="set-view-mode" data-studio-workspace="rhythm" data-studio-view="drums" data-copy="studioWorkspaceRhythm"/);
  const start = html.indexOf('<section id="drums-section"');
  const end = html.indexOf("</section>", start);
  const section = html.slice(start, end);
  assert.match(section, /data-view-region="drums"/);
  assert.match(section, /id="drum-grid"/);
  assert.match(section, /data-entity="drum-grid"/);
  assert.match(section, /id="drums-snap-select"[^>]*data-action="set-snap"/);
  assert.match(section, /id="drums-tool-select"[^>]*data-action="set-tool"[^>]*data-tool="select"/);
  assert.match(section, /id="drums-tool-draw"[^>]*data-action="set-tool"[^>]*data-tool="draw"/);
  assert.doesNotMatch(section, /drum-pads|Drum Pads/i);

  assert.match(app, /createDrumGridView/);
  assert.match(app, /isDrumKeyboardTarget\(target\)/);
  assert.match(grid, /target\.closest\("#drum-grid-scroll, #drums-selection-toolbar"\)/);
  assert.match(grid, /target\.closest\("\.instrument-mix-button, input, select, textarea/);
  assert.match(app, /commands\.addPercussionHit/);
  assert.match(app, /commands\.deletePercussionHit/);
  assert.match(app, /drumGridView\?\.updatePlayback/);
  assert.match(app, /renderDrums\(commands\.getSong\(\), normalized\)/);
  assert.match(app, /drumsSnap\.value = state\.editor\.snap/);
  const commandsSource = readFileSync(resolve("src/core/commands.js"), "utf8");
  assert.match(commandsSource, /mode === "drums"\) tool = "select"/);
  assert.match(runtime, /drums:\s*\["drums"\]/);
  assert.doesNotMatch(runtime, /expression:\s*\[[^\]]*"drums"/);

  assert.match(section, /data-studio-panel="drum-expression"/);
  assert.match(html, /id="studio-drum-expression"/);
  assert.match(css, /\.drum-cell\[data-current-step="true"\]/);
  assert.match(css, /\.drum-hit-marker/);
});

test("Hit Expression percussion capability-aware dan tidak meminjam Bend/Vibrato", () => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const css = readAppStyles();
  const grid = readFileSync(resolve("src/ui/drum-grid.js"), "utf8");
  const expression = readFileSync(resolve("src/ui/percussion-expression.js"), "utf8");

  const start = html.indexOf('<section id="drums-section"');
  const end = html.indexOf("</section>", start);
  const section = html.slice(start, end);
  assert.match(section, /id="percussion-expression-form"/);
  for (const id of ["percussion-start-tick", "percussion-velocity", "percussion-pan", "percussion-tuning", "percussion-articulation"]) {
    assert.match(section, new RegExp(`id="${id}"`));
  }
  assert.match(section, /data-action="delete-selected-percussion-hits"/);
  assert.match(section, /id="drums-selection-toolbar"|class="drums-selection-toolbar"/);
  assert.ok(section.indexOf('id="drum-grid-scroll"') < section.indexOf('id="percussion-expression-form"'));

  assert.match(app, /resolvePercussionExpression/);
  assert.match(app, /commands\.updatePercussionHit/);
  assert.match(app, /percussionExpressionPatch/);
  assert.match(grid, /onSelectHits/);
  assert.match(grid, /drumKeyboardIntent/);
  assert.match(grid, /drum-selection-rect/);
  assert.match(grid, /nextDrumCellHit/);
  assert.match(expression, /pan:\s*panPercent === 0 \? null/);
  assert.match(expression, /tuning:\s*tuning === 0 \? null/);
  assert.doesNotMatch(section, /pitchBend|vibrato/i);

  assert.match(css, /\.percussion-expression-panel/);
  assert.match(css, /\.drum-cell\[data-selected="true"\]/);
});

test("audio engine menjadwalkan percussion canonical tanpa sample dependency", () => {
  const player = readFileSync(resolve("src/audio/player.js"), "utf8");
  const transport = readFileSync(resolve("src/audio/transport.js"), "utf8");
  const percussion = readFileSync(resolve("src/audio/percussion.js"), "utf8");

  assert.match(player, /planPercussionEvents/);
  assert.match(player, /schedulePercussionVoice/);
  assert.match(player, /chokePercussionGroup/);
  assert.match(transport, /export function planPercussionEvents/);
  assert.match(percussion, /const VOICE_SPECS/);
  assert.match(percussion, /Object\.hasOwn\(VOICE_SPECS, pieceId\)/);
  assert.match(percussion, /function unsupportedVoice/);
  assert.match(percussion, /noise: voice\.noise\.map/);
  assert.match(player, /getNoiseBuffer/);
  assert.match(player, /createBiquadFilter/);
  assert.doesNotMatch(player + percussion, /fetch\(|AudioBufferSource|decodeAudioData|\.wav|\.mp3/i);
});

test("UI tidak memakai dialog blocking bawaan browser", () => {
  const app = readFileSync(resolve("src/app.js"), "utf8");
  const html = readFileSync(resolve("index.html"), "utf8");
  assert.doesNotMatch(app, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  assert.match(html, /<dialog[^>]+id="confirm-dialog"/);
});

test("Score memakai abcjs lokal dan tidak lagi bergantung pada VexFlow", () => {
  const score = readFileSync(resolve("src/ui/score.js"), "utf8");
  const html = readFileSync(resolve("index.html"), "utf8");
  const css = readAppStyles();

  assert.match(score, /ABCJS\.renderAbc\(/);
  assert.doesNotMatch(score, /VexFlow|\bVF\./);
  assert.match(html, /vendor\/abcjs\/abcjs-basic-min\.js/);
  assert.doesNotMatch(html, /vexflow/i);
  assert.match(css, /#score \.abcjs-note/);
  assert.doesNotMatch(css, /\.vf-/);
});

