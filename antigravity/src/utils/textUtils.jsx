import React from 'react';
import { parseRubyTokens } from './rubyParser';

/**
 * Parses Aozora Bunko format ruby: ｜漢字《かんじ》 or 漢字《かんじ》
 * Returns an array of React nodes (strings and <ruby> elements).
 */
/**
 * Parses text into tokens of strings and ruby objects.
 * Returns: Array<string | { base: string, ruby: string }>
 */
export const parseRubyToTokens = (text) => {
    return parseRubyTokens(text).map(token => typeof token === 'string'
        ? token
        : { base: token.base, ruby: token.ruby });
};

/**
 * Parses Aozora Bunko format ruby for React rendering.
 * Returns an array of React nodes.
 */
export const parseRuby = (text) => {
    const tokens = parseRubyToTokens(text);
    return tokens.map((token, index) => {
        if (typeof token === 'string') {
            return token;
        } else {
            return (
                <ruby key={index}>
                    {token.base}
                    <rt>{token.ruby}</rt>
                </ruby>
            );
        }
    });
};

/**
 * Counts characters excluding whitespace/newlines if needed.
 * For manuscript calculation, we usually count spaces as characters, but newlines consume the rest of the line.
 */
export const calculateStats = (text, charsPerLine = 20, linesPerPage = 20) => {
    // Strip ruby notation for character count
    // Matches ｜Base《Ruby》 -> Base
    // Matches Base《Ruby》 -> Base (for simplified ruby)

    // 1. Remove standard ruby: ｜Base《Ruby》 -> Base
    let cleanText = text.replace(/｜([^｜《]+)《[^》]+》/g, '$1');

    // 2. Remove simplified ruby: Kanji《Ruby》 -> Kanji
    // Just removing 《...》 is enough if we also remove ｜ separately
    cleanText = cleanText.replace(/｜/g, '');
    cleanText = cleanText.replace(/《[^》]*》/g, '');

    // 3. Remove font tags: {font:NAME}text{/font} -> text
    cleanText = cleanText.replace(/\{font[:：][^}]*\}/g, '');
    cleanText = cleanText.replace(/\{\/font\}/g, '');

    // 4. Remove Aozora tags: ［＃...］
    cleanText = cleanText.replace(/［＃[^］]*］/g, '');

    const charCount = cleanText.replace(/\n/g, '').length;

    // Manuscript paper calculation (approximate)
    // Each newline consumes the rest of the line
    const lines = text.split('\n');
    let totalLines = 0;

    lines.forEach(line => {
        // For manuscript calculation, we should also strip ruby from the line to estimate length
        let lineContent = line.replace(/｜([^｜《]+)《[^》]+》/g, '$1');
        lineContent = lineContent.replace(/｜/g, '');
        lineContent = lineContent.replace(/《[^》]*》/g, '');
        // Strip font tags and Aozora tags
        lineContent = lineContent.replace(/\{font[:：][^}]*\}/g, '');
        lineContent = lineContent.replace(/\{\/font\}/g, '');
        lineContent = lineContent.replace(/［＃[^］]*］/g, '');

        const length = lineContent.length;
        if (length === 0) {
            totalLines += 1; // Empty line takes 1 line
        } else {
            totalLines += Math.ceil(length / charsPerLine);
        }
    });

    const paperCount = (linesPerPage > 0) ? (totalLines / linesPerPage).toFixed(1) : (totalLines / 20).toFixed(1);

    return {
        charCount,
        paperCount,
        lines: totalLines
    };
};
