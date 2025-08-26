package main

import (
	"context"
	"embed"
	"log/slog"

	compat "nuvin-ui/internal/v3compat"
	"nuvin-ui/services"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// In v3, embed the whole frontend directory and let the dev server override
// when FRONTEND_DEVSERVER_URL is present.
//
//go:embed all:frontend/dist
var assets embed.FS

//go:embed icons/AppIcons/Assets.xcassets/AppIcon.appiconset/32.png
var iconFS embed.FS

func main() {
	svc := NewApp()
	debugSvc := NewDebug()

	// Create standalone service instances
	streamingService := services.NewStreamingService()
	httpProxyService := services.NewHTTPProxyService(streamingService)
	githubOAuthService := services.NewGitHubOAuthService()
	commandExecutorService := services.NewCommandExecutorService()
	fileDialogService := services.NewFileDialogService()
	fileToolsService := services.NewFileToolsService()
	mcpToolsService := services.NewMCPToolsService()

	app := application.New(application.Options{
		Name:        "Nuvin Space",
		Description: "Nuvin Space Application",
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		Logger:   NewFilteredLogger().Logger,
		LogLevel: slog.LevelInfo,
		Services: []application.Service{
			application.NewService(svc),
			application.NewService(debugSvc),
			application.NewService(httpProxyService),
			application.NewService(githubOAuthService),
			application.NewService(commandExecutorService),
			application.NewService(streamingService),
			application.NewService(fileDialogService),
			application.NewService(fileToolsService),
			application.NewService(mcpToolsService),
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
		DevToolsEnabled:  false,
	})

	// Initialise v3 compat helpers
	compat.Init(app, win)

	// Call legacy startup path (services will be initialized by Wails via OnStartup)
	svc.startup(context.Background())

	// Run the app
	if err := app.Run(); err != nil {
		println("Error:", err.Error())
	}
}
