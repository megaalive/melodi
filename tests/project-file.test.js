import assert from "node:assert/strict";
import test from "node:test";
import { createBlankSong } from "../src/core/model.js";
import { deserializeProject, serializeProject } from "../src/core/serialization.js";
import { saveProjectFile } from "../src/io/project-file.js";

test("Save File serializes the song and downloads it through a temporary object URL", () => {
  const song = createBlankSong(() => "file-test-id");
  song.title = "Jazz Drums — Medium Swing";
  song.tracks = [{ id: "file-kit", kind: "percussion", role: "rhythm", kitId: "gm-standard", events: [] }];
  song.mix = { melody: 0.7, percussion: { "file-kit": { ride: 0.52, snare: 0 } } };
  const serializedPayload = serializeProject(song);
  const scheduled = [];
  const revoked = [];
  let serializedSong;
  let createdBlob;
  let anchor;
  let appended;
  let clickCount = 0;
  let removeCount = 0;

  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
      createdBlob = this;
    }
  }

  const urlApi = {
    createObjectURL(blob) {
      assert.equal(blob, createdBlob);
      return "blob:melodi-project";
    },
    revokeObjectURL(url) {
      revoked.push(url);
    }
  };
  const documentRef = {
    body: {
      append(element) {
        appended = element;
      }
    },
    createElement(tagName) {
      assert.equal(tagName, "a");
      anchor = {
        href: "",
        download: "",
        hidden: false,
        click() { clickCount += 1; },
        remove() { removeCount += 1; }
      };
      return anchor;
    }
  };

  const filename = saveProjectFile(song, {
    serializeProject(value) {
      serializedSong = value;
      return serializeProject(value);
    },
    documentRef,
    urlApi,
    BlobCtor: FakeBlob,
    schedule(callback, delay) {
      scheduled.push({ callback, delay });
    }
  });

  assert.equal(serializedSong, song);
  assert.deepEqual(createdBlob.parts, [serializedPayload]);
  assert.equal(JSON.parse(createdBlob.parts[0]).schemaVersion, 5);
  const reopened = deserializeProject(createdBlob.parts[0]);
  assert.equal(reopened.mix.melody, 0.7);
  assert.deepEqual(reopened.mix.percussion["file-kit"], { ride: 0.52, snare: 0 });
  assert.deepEqual(createdBlob.options, { type: "application/json;charset=utf-8" });
  assert.equal(filename.endsWith(".melodi.json"), true);
  assert.equal(anchor.download, filename);
  assert.equal(anchor.href, "blob:melodi-project");
  assert.equal(anchor.hidden, true);
  assert.equal(appended, anchor);
  assert.equal(clickCount, 1);
  assert.equal(removeCount, 1);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 0);

  scheduled[0].callback();
  assert.deepEqual(revoked, ["blob:melodi-project"]);
});
