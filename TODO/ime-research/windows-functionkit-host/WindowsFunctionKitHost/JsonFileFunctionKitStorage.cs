using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace WindowsFunctionKitHost;

internal sealed class JsonFileFunctionKitStorage
{
    private readonly string _path;
    private JsonObject _root;

    public JsonFileFunctionKitStorage(string path)
    {
        _path = path;
        _root = Load();
    }

    public JsonObject GetValues(IEnumerable<string> keys)
    {
        var values = new JsonObject();
        foreach (var key in keys)
        {
            if (_root.TryGetPropertyValue(key, out var node))
            {
                values[key] = CloneNode(node);
            }
        }

        return values;
    }

    public JsonObject SetValues(JsonElement valuesElement)
    {
        foreach (var property in valuesElement.EnumerateObject())
        {
            _root[property.Name] = JsonNode.Parse(property.Value.GetRawText());
        }

        Persist();
        return Snapshot();
    }

    public JsonObject Snapshot()
    {
        return (JsonObject)(CloneNode(_root) ?? new JsonObject());
    }

    private JsonObject Load()
    {
        if (!File.Exists(_path))
        {
            return new JsonObject();
        }

        try
        {
            var text = File.ReadAllText(_path, new UTF8Encoding(false));
            return JsonNode.Parse(text) as JsonObject ?? new JsonObject();
        }
        catch
        {
            return new JsonObject();
        }
    }

    private void Persist()
    {
        var directory = Path.GetDirectoryName(_path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(_path, _root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));
    }

    private static JsonNode? CloneNode(JsonNode? node)
    {
        return node is null ? null : JsonNode.Parse(node.ToJsonString());
    }
}
