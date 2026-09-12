const fs = require("node:fs");
const path = require("node:path");

const DATA_DIRECTORY = path.join(__dirname, "..", "data", "tomarigi");

function loadJson(filename) {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIRECTORY, filename), "utf8"));
}

function loadGeneratedData() {
    const homonymData = loadJson("homonyms.json");
    const kanjiData = loadJson("kanji.json");
    const usageExceptionData = loadJson("usage-exceptions.json");

    return {
        homonymGroups: homonymData.homonymGroups,
        kanji: kanjiData,
        usageExceptions: usageExceptionData.inappropriatePosExceptions,
    };
}

function createTomarigiReferenceIndex(data = loadGeneratedData()) {
    const homonyms = new Map(data.homonymGroups.map((group) => [group.reading, group.items]));
    const kanji = new Map(data.kanji.map((item) => [item.text, item]));

    return {
        findHomonymCandidates(token) {
            return (homonyms.get(token.reading) || []).filter(
                (item) => item.text !== token.surface && item.enabled,
            );
        },
        classifyKanji(char) {
            return kanji.get(char) || null;
        },
        isUsageException(kind, word) {
            return data.usageExceptions[kind]?.includes(word) || false;
        },
    };
}

module.exports = { createTomarigiReferenceIndex };
