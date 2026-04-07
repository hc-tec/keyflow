using System.Text;
using System.Text.Json;

namespace WindowsImeTestHost;

internal sealed class FunctionKitStorageStore
{
    private readonly string _storagePath;
    private readonly Dictionary<string, JsonElement> _values = new(StringComparer.Ordinal);

    public FunctionKitStorageStore(string storagePath)
    {
        _storagePath = storagePath;
        Load();
    }

    public string StoragePath => _storagePath;

    public IReadOnlyDictionary<string, JsonElement> GetValues(IEnumerable<string> keys)
    {
        var result = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var key in keys)
        {
            if (_values.TryGetValue(key, out var value))
            {
                result[key] = value.Clone();
            }
        }

        return result;
    }

    public void SetValues(JsonElement values)
    {
        if (values.ValueKind != JsonValueKind.Object)
        {
            return;
        }

        foreach (var property in values.EnumerateObject())
        {
            _values[property.Name] = property.Value.Clone();
        }

        Persist();
    }

    public void Clear()
    {
        _values.Clear();
        Persist();
    }

    private void Load()
    {
        if (!File.Exists(_storagePath))
        {
            return;
        }

        using var document = JsonDocument.Parse(File.ReadAllText(_storagePath, Encoding.UTF8));
        if (document.RootElement.ValueKind != JsonValueKind.Object)
        {
            return;
        }

        foreach (var property in document.RootElement.EnumerateObject())
        {
            _values[property.Name] = property.Value.Clone();
        }
    }

    private void Persist()
    {
        var directory = Path.GetDirectoryName(_storagePath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var json = JsonSerializer.Serialize(_values, new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            WriteIndented = true
        });
        File.WriteAllText(_storagePath, json, new UTF8Encoding(false));
    }
}
