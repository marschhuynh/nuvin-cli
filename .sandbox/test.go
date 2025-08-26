package main

import (
	"os"
	"os/exec"
)

func main() {
	result, err := exec.LookPath("go")
	path := os.Getenv("")
	if err != nil {
		print(err.Error())
		return
	}
	print(result)
	print(path)
}
