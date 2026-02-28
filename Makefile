# Build commands
build:
	pnpm build

build-core:
	pnpm build:core

build-cli:
	pnpm build:cli

clean:
	pnpm clean

# Run commands
run:
	pnpm run:dev

# Development

lint:
	pnpm lint

format:
	pnpm format

test:
	pnpm test

install: build
	pnpm install -g ~/Projects/nuvin-space/packages/nuvin-cli

ci:
	act -j release -W /Users/marsch/Projects/nuvin-space/.github/workflows/release.yml --container-architecture linux/amd64

ax-helper:
	cd packages/nuvin-core/src/tools/computer/ax-helper && \
		swiftc -O -o ax-helper main.swift -framework ApplicationServices -framework AppKit -framework CoreText && \
		mkdir -p ~/.nuvin/bin && \
		cp ax-helper ~/.nuvin/bin/ax-helper

ax-demo:
	@echo "=== ax-helper usage ==="
	@echo ""
	@echo "List running apps:"
	@echo "  ~/.nuvin/bin/ax-helper list-apps"
	@echo ""
	@echo "Snapshot frontmost app:"
	@echo "  ~/.nuvin/bin/ax-helper snapshot --hint-mode leafCompact"
	@echo ""
	@echo "Snapshot specific app:"
	@echo "  ~/.nuvin/bin/ax-helper snapshot --app Safari --hint-mode leafCompact"
	@echo ""
	@echo "Press element by ref (requires snapshot first):"
	@echo "  ~/.nuvin/bin/ax-helper press --ref 5 --snapshot-id <id>"
	@echo ""
	@echo "Set value on element:"
	@echo "  ~/.nuvin/bin/ax-helper set-value --ref 3 --snapshot-id <id> --value 'hello'"
	@echo ""
	@echo "Get window ID:"
	@echo "  ~/.nuvin/bin/ax-helper window-id --app Safari"
	@echo
	@echo "Get window ID:"
	@echo " ~/.nuvin/bin/ax-helper annotated-screenshot --app Safari --output ~/Desktop/annotated.png"
	@echo ""
	@echo "Annotate screenshot (pipe hints JSON via stdin):"
	@echo "  echo '[]' | ~/.nuvin/bin/ax-helper annotate input.png output.png --scale 2"
	@echo ""
	@echo "Options:"
	@echo "  --hint-mode leafCompact|leafOnly|full"
	@echo "  --max-depth N        (default: 8)"
	@echo "  --max-elements N     (default: 500)"

bun-build:
# 	bun build --compile --target=bun-linux-x64 packages/nuvin-cli/source/cli.tsx --outfile nuvin
	bun build --compile packages/nuvin-cli/source/cli.tsx --outfile nuvin