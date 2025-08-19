package main

import (
	runtime "nuvin-ui/internal/v3compat"

	hook "github.com/robotn/gohook"
)

func (a *App) listenForGlobalShortcut() {
	hook.Register(hook.KeyDown, []string{"space", "alt"}, func(e hook.Event) {
		runtime.WindowShow(a.ctx)
	})

	// Start the hook event loop
	s := hook.Start()
	<-hook.Process(s)
}
