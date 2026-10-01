VSCODE_DTS_CANDIDATES := \
	/usr/share/codium/resources/app/out/vscode-dts/vscode.d.ts \
	/usr/share/code/resources/app/out/vscode-dts/vscode.d.ts \
	$(HOME)/.vscode-server/extensions/.*/vscode.d.ts

VSCODE_DTS ?= $(firstword $(wildcard $(VSCODE_DTS_CANDIDATES)))

# on Debian system
#  apt install --no-install-recommends node-typescript nodejs
NODE       ?= /usr/bin/node
TSC        ?= /usr/bin/tsc
TSC_ES     ?= ES2025
TSC_TROOTS ?= /usr/share/nodejs/@types/
TSC_FLAGS  ?= --ignoreConfig --target $(TSC_ES) --module commonjs --strict --esModuleInterop --skipLibCheck false --typeRoots $(TSC_TROOTS)

SOURCE_DATE_EPOCH ?= 315532800
PAGER ?= /usr/bin/less --RAW-CONTROL-CHARS --quit-if-one-screen

var_status  = $(if $(filter undefined,$(origin $(1))),$(YELLOW)<unset>$(RESET),$(if $($(1)),$($(1)),$(YELLOW)<unset>$(RESET)))
path_status = $($(1))$(if $(wildcard $($(1))),,$(RED) <missing>$(RESET))

.PHONY: show-env
show-env:
	@{ \
		printf 'Build Environment:\n'; \
		printf ' %-28s: %s\n' \
			'tsc'         '$(call path_status,TSC)' \
			'  TSC_FLAGS'  '$(TSC_FLAGS)' \
			'node'        '$(call path_status,NODE)' \
			'vscode.d.ts' '$(call path_status,VSCODE_DTS)'; \
	} | $(PAGER)
