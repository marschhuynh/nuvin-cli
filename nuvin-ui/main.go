package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "Nuvin Space",
		Width:     1224,
		Height:    768,
		MinWidth:  1224,
		MinHeight: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Debug: options.Debug{
			OpenInspectorOnStartup: false,
		},
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			Appearance:           mac.DefaultAppearance,
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			About: &mac.AboutInfo{
				Title:   "Nuvin Space",
				Message: "© 2025 Marsch Huynh <marsch.huynh@gmail.com>",
				Icon:    nil, // Icon is handled through wails.json
			},
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
