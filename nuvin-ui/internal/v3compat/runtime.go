package v3compat

import (
    "context"
    "log/slog"

    "github.com/wailsapp/wails/v3/pkg/application"
)

// Keep a handle to the global app and main window for convenience
var appRef *application.App
var mainWindow *application.WebviewWindow

// Init wires the v3 application + main window for compatibility helpers.
func Init(app *application.App, window *application.WebviewWindow) {
    appRef = app
    mainWindow = window
}

// ----- Logging -----

func logger() *slog.Logger {
    if appRef != nil && appRef.Logger != nil {
        return appRef.Logger
    }
    return slog.Default()
}

func LogInfo(_ context.Context, msg string) {
    logger().Info(msg)
}

func LogError(_ context.Context, msg string) {
    logger().Error(msg)
}

func LogWarning(_ context.Context, msg string) {
    logger().Warn(msg)
}

func LogDebug(_ context.Context, msg string) {
    logger().Debug(msg)
}

// ----- Events -----

func EventsEmit(_ context.Context, name string, data any) {
    if appRef != nil {
        appRef.Event.Emit(name, data)
    }
}

// ----- Clipboard -----

func ClipboardSetText(_ context.Context, text string) error {
    if appRef != nil {
        _ = appRef.Clipboard.SetText(text)
    }
    return nil
}

// ----- Browser -----

func BrowserOpenURL(_ context.Context, url string) {
    if appRef != nil {
        _ = appRef.Browser.OpenURL(url)
    }
}

// ----- Windows -----

func WindowShow(_ context.Context) {
    if mainWindow != nil {
        mainWindow.Show()
    } else if appRef != nil {
        appRef.Show()
    }
}

// ----- Dialogs (sync) -----

type DialogType int

const (
    InfoDialog DialogType = iota
    QuestionDialog
    WarningDialog
    ErrorDialog
)

type MessageDialogOptions struct {
    Type          DialogType
    Title         string
    Message       string
    Buttons       []string
    DefaultButton string
    CancelButton  string
}

// MessageDialog emulates the v2 sync dialog and returns the selected button label.
func MessageDialog(_ context.Context, o MessageDialogOptions) (string, error) {
    if appRef == nil {
        return "", nil
    }

    // pick dialog type
    var d *application.MessageDialog
    switch o.Type {
    case InfoDialog:
        d = application.InfoDialog()
    case QuestionDialog:
        d = application.QuestionDialog()
    case WarningDialog:
        d = application.WarningDialog()
    case ErrorDialog:
        d = application.ErrorDialog()
    default:
        d = application.InfoDialog()
    }

    if mainWindow != nil {
        d.AttachToWindow(mainWindow)
    }
    if o.Title != "" {
        d.SetTitle(o.Title)
    }
    if o.Message != "" {
        d.SetMessage(o.Message)
    }

    // result channel
    result := make(chan string, 1)

    // Add buttons + callbacks
    var defaultBtn, cancelBtn *application.Button
    for _, label := range o.Buttons {
        btn := d.AddButton(label).OnClick(func(l string) func() {
            return func() { result <- l }
        }(label))
        if label == o.DefaultButton {
            defaultBtn = btn
        }
        if label == o.CancelButton {
            cancelBtn = btn
        }
    }
    if defaultBtn != nil {
        d.SetDefaultButton(defaultBtn)
    }
    if cancelBtn != nil {
        d.SetCancelButton(cancelBtn)
    }

    // Show dialog (async) then wait for selection
    d.Show()
    selected := <-result
    return selected, nil
}
