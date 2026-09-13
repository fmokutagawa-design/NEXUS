const assert = require("node:assert/strict");

const { createTomarigiReferenceIndex } = require("./tomarigi-reference-data.cjs");

function testGeneratedReferenceData() {
    const index = createTomarigiReferenceIndex();

    assert.deepEqual(
        index.findHomonymCandidates({ surface: "愛称", reading: "アイショウ" }).map((item) => item.text),
        ["相性"],
    );
    assert.equal(index.classifyKanji("丐").isCommon, false);
    assert.equal(index.isUsageException("的", "圧倒的"), true);
    assert.deepEqual(index.classifyKanji("亜").readings, {
        OnS: ["ア"], KunS: [], On: [], Kun: ["つ-ぐ"],
    });
}

function testReadOnlyLookupBoundaries() {
    const index = createTomarigiReferenceIndex({
        homonymGroups: [
            {
                reading: "テスト",
                items: [
                    { text: "入力", enabled: true },
                    { text: "候補", enabled: true },
                    { text: "無効", enabled: false },
                ],
            },
        ],
        kanji: [{ text: "試", isCommon: true }],
        usageExceptions: { 的: ["例外語"] },
    });

    assert.deepEqual(
        index.findHomonymCandidates({ surface: "入力", reading: "テスト" }).map((item) => item.text),
        ["候補"],
    );
    assert.deepEqual(index.findHomonymCandidates({ surface: "入力", reading: "不明" }), []);
    assert.deepEqual(index.classifyKanji("試"), { text: "試", isCommon: true });
    assert.equal(index.classifyKanji("不明"), null);
    assert.equal(index.isUsageException("的", "例外語"), true);
    assert.equal(index.isUsageException("的", "通常語"), false);
    assert.equal(index.isUsageException("不明", "例外語"), false);
    assert.equal("fix" in index, false);
    assert.deepEqual(Object.keys(index).sort(), ["classifyKanji", "findHomonymCandidates", "isUsageException"]);
    for (const method of ["suggested", "suggest", "replace", "write", "save", "applyFix"]) {
        assert.equal(method in index, false);
    }
}

testGeneratedReferenceData();
testReadOnlyLookupBoundaries();
console.log("PASS: Tomarigi reference index lookups are read-only");
