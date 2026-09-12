using System;
using System.Linq;
using System.Text;

internal static class TomarigiResourceDump
{
    static string Safe(string value) => (value ?? "").Replace("\\", "\\\\").Replace("\t", "\\t").Replace("\r", "\\r").Replace("\n", "\\n");

    public static void Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false);

        foreach (var item in saezuri.NLP.CkanjiSet.Load().KanjiList.OrderBy(x => x.Text, StringComparer.Ordinal))
            Console.WriteLine($"KANJI\t{Safe(item.Text)}\t{item.IsCommon}\t{item.LearnLv}\t{item.JISLv}\t{item.Stroke}");

        foreach (var group in saezuri.NLP.CHomonymSet.Load().HomonymList.OrderBy(x => x.Read, StringComparer.Ordinal))
            foreach (var item in group.Items.OrderBy(x => x.Text, StringComparer.Ordinal))
                Console.WriteLine($"HOMONYM\t{Safe(group.Read)}\t{Safe(item.Text)}\t{Safe(item.Mean)}\t{item.Enabled}");
    }
}
