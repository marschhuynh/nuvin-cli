package main

import (
	"context"
	"embed"
	"log/slog"

	compat "nuvin-ui/internal/v3compat"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// In v3, embed the whole frontend directory and let the dev server override
// when FRONTEND_DEVSERVER_URL is present.
//
//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create application options
	// Create our service instance
	svc := NewApp()

	app := application.New(application.Options{
		Name:        "Nuvin Space",
		Description: "Nuvin Space Application",
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		LogLevel: slog.LevelInfo,
		Services: []application.Service{
			application.NewService(svc),
		},
	})

	// Create the main window
	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Nuvin Space",
		Width:            1224,
		Height:           768,
		MinWidth:         1224,
		MinHeight:        768,
		BackgroundColour: application.NewRGB(27, 38, 54),
		// DevToolsEnabled defaults to true in non-production
	})

	// Initialise v3 compat helpers
	compat.Init(app, win)

	// Call legacy startup path (ctx is unused by compat)
	svc.startup(context.Background())

	// Run the app
	if err := app.Run(); err != nil {
		println("Error:", err.Error())
	}
}
