using Microsoft.Web.WebView2.WinForms;
using System.Windows.Forms;

namespace WindowsImeTestHost;

internal sealed partial class MainForm
{
    private Control BuildRootLayout()
    {
        var splitContainer = new SplitContainer
        {
            Dock = DockStyle.Fill,
            FixedPanel = FixedPanel.Panel1,
            SplitterDistance = 300,
            Name = "rootSplitContainer"
        };

        splitContainer.Panel1.Controls.Add(BuildCommandPanel());
        splitContainer.Panel2.Controls.Add(BuildWorkspacePanel());

        return splitContainer;
    }

    private Control BuildCommandPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            Padding = new Padding(12),
            Name = "commandPanel"
        };
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var introLabel = new Label
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            Text = "这个宿主同时跑 Windows IME 测试区与浏览器式功能件运行时。\r\n目标是先把插件 UI 呈现、握手、候选回传与显式提交跑通。",
            Name = "introLabel"
        };

        var buttonPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            Name = "buttonPanel"
        };

        buttonPanel.Controls.Add(CreateCommandButton("focusSingleLineButton", "聚焦单行输入框", () => FocusHost("single-line", _singleLineTextBox)));
        buttonPanel.Controls.Add(CreateCommandButton("focusMultiLineButton", "聚焦多行输入框", () => FocusHost("multi-line", _multiLineTextBox)));
        buttonPanel.Controls.Add(CreateCommandButton("focusRichTextButton", "聚焦 RichTextBox", () => FocusHost("rich-text", _richTextBox)));
        buttonPanel.Controls.Add(CreateCommandButton("focusWebInputButton", "聚焦网页 input", () => FocusWebElement(WebInputId)));
        buttonPanel.Controls.Add(CreateCommandButton("focusWebTextareaButton", "聚焦网页 textarea", () => FocusWebElement(WebTextareaId)));
        buttonPanel.Controls.Add(CreateCommandButton("focusWebEditorButton", "聚焦网页 contenteditable", () => FocusWebElement(WebEditorId)));
        buttonPanel.Controls.Add(CreateAsyncCommandButton("reloadFunctionKitButton", "重载功能件面板", () => InitializeFunctionKitIfNeededAsync(forceReload: true)));
        buttonPanel.Controls.Add(CreateAsyncCommandButton("pushFunctionKitContextButton", "推送上下文", async () =>
        {
            if (_functionKitReady)
            {
                await DispatchContextSnapshotAsync(replyTo: null, renderCandidates: true);
            }
        }));
        buttonPanel.Controls.Add(CreateAsyncCommandButton("pushFunctionKitCandidatesButton", "推送候选", async () =>
        {
            if (_functionKitReady)
            {
                await DispatchCandidatesRenderAsync(replyTo: null, reason: "host-manual");
            }
        }));
        buttonPanel.Controls.Add(CreateAsyncCommandButton("clearFunctionKitStorageButton", "清空功能件存储", ClearFunctionKitStorageAsync));
        buttonPanel.Controls.Add(CreateCommandButton("reloadWebPageButton", "重载网页场景", LoadWebDocument));
        buttonPanel.Controls.Add(CreateCommandButton("snapshotNowButton", "刷新当前快照", RefreshState));
        buttonPanel.Controls.Add(CreateCommandButton("clearAllInputsButton", "清空全部输入", ClearAllInputs));

        var statusGroup = new GroupBox
        {
            Dock = DockStyle.Top,
            Text = "当前状态",
            Name = "statusGroup"
        };
        statusGroup.Controls.Add(BuildStatusTable());

        var usageLabel = new Label
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            Text = "关键点：当前焦点与功能件提交目标分离，候选点击后按最后提交目标显式写回。",
            Name = "usageLabel"
        };

        panel.Controls.Add(introLabel, 0, 0);
        panel.Controls.Add(buttonPanel, 0, 1);
        panel.Controls.Add(statusGroup, 0, 2);
        panel.Controls.Add(usageLabel, 0, 3);
        return panel;
    }

    private Control BuildStatusTable()
    {
        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 4,
            Padding = new Padding(8),
            Name = "statusTable"
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddStatusRow(table, 0, "激活宿主", _activeHostTextBox);
        AddStatusRow(table, 1, "网页焦点", _activeWebElementTextBox);
        AddStatusRow(table, 2, "最近请求", _lastFocusRequestTextBox);
        AddStatusRow(table, 3, "网页就绪", _browserReadyTextBox);

        return table;
    }

    private Control BuildWorkspacePanel()
    {
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            Padding = new Padding(12),
            Name = "workspacePanel",
            AutoScroll = true
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 220));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 180));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 340));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 240));

        layout.Controls.Add(BuildStandardInputsGroup(), 0, 0);
        layout.Controls.Add(BuildRichTextGroup(), 0, 1);
        layout.Controls.Add(BuildWebGroup(), 0, 2);
        layout.Controls.Add(BuildFunctionKitGroup(), 0, 3);
        layout.Controls.Add(BuildSnapshotGroup(), 0, 4);
        return layout;
    }

    private Control BuildStandardInputsGroup()
    {
        var group = new GroupBox
        {
            Dock = DockStyle.Fill,
            Text = "标准输入框",
            Name = "standardInputsGroup"
        };

        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 2,
            Padding = new Padding(12),
            Name = "standardInputsTable"
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 160));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 64));
        table.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        table.Controls.Add(CreateFieldLabel("singleLineLabel", "单行 TextBox"), 0, 0);
        table.Controls.Add(CreateCommandButton("focusSingleLineInlineButton", "聚焦", () => FocusHost("single-line", _singleLineTextBox)), 1, 0);
        table.Controls.Add(_singleLineTextBox, 2, 0);

        table.Controls.Add(CreateFieldLabel("multiLineLabel", "多行 TextBox"), 0, 1);
        table.Controls.Add(CreateCommandButton("focusMultiLineInlineButton", "聚焦", () => FocusHost("multi-line", _multiLineTextBox)), 1, 1);
        table.Controls.Add(_multiLineTextBox, 2, 1);

        group.Controls.Add(table);
        return group;
    }

    private Control BuildRichTextGroup()
    {
        var group = new GroupBox
        {
            Dock = DockStyle.Fill,
            Text = "富文本输入框",
            Name = "richTextGroup"
        };

        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1,
            Padding = new Padding(12),
            Name = "richTextTable"
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 160));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        table.Controls.Add(CreateFieldLabel("richTextLabel", "RichTextBox"), 0, 0);
        table.Controls.Add(CreateCommandButton("focusRichTextInlineButton", "聚焦", () => FocusHost("rich-text", _richTextBox)), 1, 0);
        table.Controls.Add(_richTextBox, 2, 0);

        group.Controls.Add(table);
        return group;
    }

    private Control BuildWebGroup()
    {
        var group = new GroupBox
        {
            Dock = DockStyle.Fill,
            Text = "网页输入场景（旧 fallback）",
            Name = "webGroup"
        };

        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            Padding = new Padding(12),
            Name = "webTable"
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 340));

        table.Controls.Add(_webBrowser, 0, 0);
        table.Controls.Add(BuildWebDetailsPanel(), 1, 0);

        group.Controls.Add(table);
        return group;
    }

    private Control BuildWebDetailsPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 8,
            Name = "webDetailsPanel"
        };
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 90));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 90));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        panel.Controls.Add(new Label
        {
            AutoSize = true,
            Text = "这里继续保留 WinForms 自带 WebBrowser，专门作为旧网页输入 fallback 场景。",
            Name = "webFallbackLabel"
        }, 0, 0);
        panel.Controls.Add(CreateFieldLabel("webInputSnapshotLabel", "网页 input 当前值"), 0, 1);
        panel.Controls.Add(_webInputSnapshotTextBox, 0, 2);
        panel.Controls.Add(CreateFieldLabel("webTextareaSnapshotLabel", "网页 textarea 当前值"), 0, 3);
        panel.Controls.Add(_webTextareaSnapshotTextBox, 0, 4);
        panel.Controls.Add(CreateFieldLabel("webEditorSnapshotLabel", "网页 contenteditable 当前值"), 0, 5);
        panel.Controls.Add(_webEditorSnapshotTextBox, 0, 6);
        panel.Controls.Add(new Label
        {
            AutoSize = true,
            Text = "浏览器式功能件运行时统一放在下方 WebView2 面板，不和这里混用。",
            Name = "webSnapshotHintLabel"
        }, 0, 7);

        return panel;
    }

    private Control BuildFunctionKitGroup()
    {
        var group = new GroupBox
        {
            Dock = DockStyle.Fill,
            Text = "浏览器式功能件运行时（WebView2）",
            Name = "functionKitGroup"
        };

        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            SplitterDistance = 820,
            Name = "functionKitSplitContainer"
        };

        split.Panel1.Padding = new Padding(12);
        split.Panel1.Controls.Add(_functionKitWebView);
        split.Panel2.Padding = new Padding(12);
        split.Panel2.Controls.Add(BuildFunctionKitDetailsPanel());

        group.Controls.Add(split);
        return group;
    }

    private Control BuildFunctionKitDetailsPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 9,
            Name = "functionKitDetailsPanel"
        };
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        panel.Controls.Add(new Label
        {
            AutoSize = true,
            Text = "安全策略：只加载本地静态资源，只开放受权限控制的 Host Bridge，不给页面原始宿主对象。",
            Name = "functionKitIntroLabel"
        }, 0, 0);
        panel.Controls.Add(BuildFunctionKitStatusTable(), 0, 1);
        panel.Controls.Add(CreateFieldLabel("functionKitEntryLabel", "入口 HTML"), 0, 2);
        panel.Controls.Add(_functionKitEntryTextBox, 0, 3);
        panel.Controls.Add(CreateFieldLabel("functionKitStorageLabel", "存储文件"), 0, 4);
        panel.Controls.Add(_functionKitStorageTextBox, 0, 5);
        panel.Controls.Add(CreateFieldLabel("functionKitErrorLabel", "最近错误"), 0, 6);
        panel.Controls.Add(_functionKitLastErrorTextBox, 0, 7);

        var actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            AutoSize = true,
            Name = "functionKitActions"
        };
        actions.Controls.Add(CreateAsyncCommandButton("functionKitReloadInlineButton", "重载", () => InitializeFunctionKitIfNeededAsync(forceReload: true)));
        actions.Controls.Add(CreateAsyncCommandButton("functionKitContextInlineButton", "推送上下文", async () =>
        {
            if (_functionKitReady)
            {
                await DispatchContextSnapshotAsync(replyTo: null, renderCandidates: true);
            }
        }));
        actions.Controls.Add(CreateAsyncCommandButton("functionKitCandidatesInlineButton", "推送候选", async () =>
        {
            if (_functionKitReady)
            {
                await DispatchCandidatesRenderAsync(replyTo: null, reason: "host-inline");
            }
        }));
        panel.Controls.Add(actions, 0, 8);

        return panel;
    }

    private Control BuildFunctionKitStatusTable()
    {
        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            ColumnCount = 2,
            RowCount = 5,
            Padding = new Padding(0, 8, 0, 8),
            Name = "functionKitStatusTable"
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 84));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddStatusRow(table, 0, "状态", _functionKitReadyStateTextBox);
        AddStatusRow(table, 1, "会话", _functionKitSessionTextBox);
        AddStatusRow(table, 2, "提交目标", _functionKitCommitTargetTextBox);
        AddStatusRow(table, 3, "最近消息", _functionKitLastMessageTypeTextBox);
        AddStatusRow(table, 4, "入口", _functionKitEntryTextBox);

        return table;
    }

    private Control BuildSnapshotGroup()
    {
        var group = new GroupBox
        {
            Dock = DockStyle.Fill,
            Text = "实时快照 / 事件日志",
            Name = "snapshotGroup"
        };

        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            SplitterDistance = 560,
            Name = "snapshotSplitContainer"
        };

        split.Panel1.Padding = new Padding(12);
        split.Panel1.Controls.Add(_snapshotTextBox);
        split.Panel2.Padding = new Padding(12);
        split.Panel2.Controls.Add(_eventLogTextBox);

        group.Controls.Add(split);
        return group;
    }

    private static TextBox CreateEditableTextBox(string name, bool multiline, string placeholderText)
    {
        return new TextBox
        {
            Name = name,
            Dock = DockStyle.Fill,
            Multiline = multiline,
            PlaceholderText = placeholderText,
            ScrollBars = multiline ? ScrollBars.Vertical : ScrollBars.None,
            Font = new Font("Segoe UI", 11F),
            AcceptsReturn = multiline,
            AcceptsTab = multiline
        };
    }

    private static RichTextBox CreateRichTextBox()
    {
        return new RichTextBox
        {
            Name = "richTextInputBox",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 11F),
            DetectUrls = false
        };
    }

    private WebBrowser CreateWebBrowser()
    {
        var browser = new WebBrowser
        {
            Name = "webInputBrowser",
            Dock = DockStyle.Fill,
            ScriptErrorsSuppressed = true,
            IsWebBrowserContextMenuEnabled = false,
            WebBrowserShortcutsEnabled = false
        };
        browser.DocumentCompleted += (_, _) =>
        {
            _browserReady = true;
            AppendLog("网页输入场景已加载。");
            RefreshState();
        };
        return browser;
    }

    private WebView2 CreateFunctionKitWebView()
    {
        var userDataFolder = ResolveFunctionKitCachePath();
        Directory.CreateDirectory(userDataFolder);

        return new WebView2
        {
            Name = "functionKitWebView",
            Dock = DockStyle.Fill,
            CreationProperties = new CoreWebView2CreationProperties
            {
                UserDataFolder = userDataFolder
            }
        };
    }

    private static TextBox CreateReadOnlyTextBox(string name, bool multiline)
    {
        return new TextBox
        {
            Name = name,
            Dock = DockStyle.Fill,
            Multiline = multiline,
            ReadOnly = true,
            ScrollBars = multiline ? ScrollBars.Both : ScrollBars.Horizontal,
            Font = new Font("Consolas", 10F),
            BackColor = SystemColors.Window
        };
    }

    private static Label CreateFieldLabel(string name, string text)
    {
        return new Label
        {
            Name = name,
            Text = text,
            AutoSize = true,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        };
    }

    private Button CreateCommandButton(string name, string text, Action action)
    {
        var button = new Button
        {
            Name = name,
            Text = text,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(10, 6, 10, 6)
        };
        button.Click += (_, _) => action();
        return button;
    }

    private Button CreateAsyncCommandButton(string name, string text, Func<Task> action)
    {
        var button = new Button
        {
            Name = name,
            Text = text,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(10, 6, 10, 6)
        };
        button.Click += async (_, _) => await action();
        return button;
    }

    private static void AddStatusRow(TableLayoutPanel table, int rowIndex, string labelText, Control valueControl)
    {
        table.Controls.Add(new Label
        {
            AutoSize = true,
            Text = labelText,
            TextAlign = ContentAlignment.MiddleLeft,
            Dock = DockStyle.Fill
        }, 0, rowIndex);
        table.Controls.Add(valueControl, 1, rowIndex);
    }
}
