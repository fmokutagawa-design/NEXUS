using System;
using System.Linq;
using System.Text;
using System.Collections.Generic;

internal static class TomarigiResourceDump
{
    static string Safe(string value) => (value ?? "").Replace("\\", "\\\\").Replace("\t", "\\t").Replace("\r", "\\r").Replace("\n", "\\n");

    static void Readings(string text, string kind, List<string> readings)
    {
        // Preserve source list order and the distinction between common (S)
        // and other readings; do not merge, sort or infer missing readings.
        foreach (var reading in readings)
            Console.WriteLine($"READING\t{Safe(text)}\t{kind}\t{Safe(reading)}");
    }

    public static void Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false);

        var kanjiSet = saezuri.NLP.CkanjiSet.Load();
        foreach (var item in kanjiSet.KanjiList.OrderBy(x => x.Text, StringComparer.Ordinal))
        {
            Console.WriteLine($"KANJI\t{Safe(item.Text)}\t{item.IsCommon}\t{item.LearnLv}\t{item.JISLv}\t{item.Stroke}\t{item.RadicalID}\t{Safe(item.Parts)}\t{Safe(item.Similar)}");
            Readings(item.Text, "OnS", item.OnS);
            Readings(item.Text, "KunS", item.KunS);
            Readings(item.Text, "On", item.On);
            Readings(item.Text, "Kun", item.Kun);
        }
        foreach (var radical in kanjiSet.RadicalList.OrderBy(x => x.ID))
            Console.WriteLine($"RADICAL\t{radical.ID}\t{Safe(radical.Text)}\t{Safe(radical.Read)}\t{radical.Stroke}");

        foreach (var group in saezuri.NLP.CHomonymSet.Load().HomonymList.OrderBy(x => x.Read, StringComparer.Ordinal))
            foreach (var item in group.Items.OrderBy(x => x.Text, StringComparer.Ordinal))
                Console.WriteLine($"HOMONYM\t{Safe(group.Read)}\t{Safe(item.Text)}\t{Safe(item.Mean)}\t{item.Enabled}");
    }
}
