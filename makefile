MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules
MAKEFLAGS += --no-builtin-variables
ifeq ($(filter -j% --jobs%,$(MAKEFLAGS)),)
MAKEFLAGS += -j$(shell nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)
endif

# removed by --no-builtin-variables, redefine otherwise --no-print-directory causes a warning
# make[1]: warning: undefined variable 'GNUMAKEFLAGS'
# report bug?
GNUMAKEFLAGS :=

.DELETE_ON_ERROR:
.EXTRA_PREREQS := $(MAKEFILE_LIST)

RUN_SILENT_PATTERN := warning|deprecated|obsolete
include make/debug-verbose.mk
include make/toolchain.mk
#include make/git.mk


define HELP_TEXT
Use make to build, test, and create a vsix package

Main targets

 * $(MAKE) clean
 * $(MAKE) test                 - build and run internal tests
 * $(MAKE) package              - creates $(BUILD_DIR)/$(PACKAGE_NAME)
 * $(MAKE) tsconfig.json        - creates a local tsconfig.json file
 * $(MAKE) all                  - equivalent to $(MAKE) all test
 * $(MAKE) show-env             - show environment used for building, like compiler flags and used vscode.d.ts

Use verbose (for exameple "$(MAKE) package vebose" ) to show a more verbose output

The local tsconfig.json file is not used for building the package, but to give vscode (and possible other IDE)
a better understanding of the code structure/autocompletion/...

Extension can be installed from the gui ("Install from VSIX...") or with the following command

  code --install $(BUILD_DIR)/$(PACKAGE_NAME);

Dependencies

 * tsc (Debian package node-typescript) is required for transpiling from typescript to javascript
 * node (Debian package nodejs) is required for executing the tests
 * vscode.d.ts is taken from the current vscode/vscodium version
 * npm or other package manager are not used is not used

On debian, the dependencies can be installed with

  apt install --no-install-recommends node-typescript nodejs
endef

.DEFAULT_GOAL := help
.PHONY: help .help
help:
	@$(MAKE) --no-print-directory .help | $(PAGER)
.help:
	@:
	$(info $(HELP_TEXT))

EXTENSION_NAME         := vscode-make
EXTENSION_DISPLAY_NAME := Make for VSCode
EXTENSION_VERSION      := 0.0.1
EXTENSION_DESCRIPTION  := Browse and run Makefile targets from the activity bar.
PACKAGE_NAME           := $(EXTENSION_NAME).vsix

SUBST := sed -e 's|@EXTENSION_VERSION@|$(EXTENSION_VERSION)|g' -e 's|@EXTENSION_DESCRIPTION@|$(EXTENSION_DESCRIPTION)|g' -e 's|@EXTENSION_NAME@|$(EXTENSION_NAME)|g' -e 's|@EXTENSION_DISPLAY_NAME@|$(EXTENSION_DISPLAY_NAME)|g'

SOURCE_DATE_EPOCH ?= 0
BUILD_DIR         ?= build

TS_FILES := $(wildcard source/*.ts)
JS_STAMP := $(BUILD_DIR)/extension/.js.stamp
$(JS_STAMP): $(TS_FILES)
	$(info # transpile ts to js)
	$(call run_silent, $(TSC) $(TSC_FLAGS) --outDir $(BUILD_DIR)/extension --rootDir source $^ "$(VSCODE_DTS)")
	@touch "$@"

$(BUILD_DIR)/test/make-parser.test.js: $(JS_STAMP) source/test/make-parser.test.ts
	@rm -rf "$(@D)"
	$(call run_silent, $(TSC) $(TSC_FLAGS) --outDir $(BUILD_DIR)/ --rootDir source --types node $(filter %.ts,$^) "$(VSCODE_DTS)")

.PHONY: test
test: $(BUILD_DIR)/test/make-parser.test.js
	$(info # execute tests)
	$(NODE) $^

$(BUILD_DIR)/$(PACKAGE_NAME): source/Content_Types.xml source/extension.t.vsixmanifest media/make.svg source/package.t.json $(JS_STAMP)
	@rm -rf "$(@D)/package";
	@mkdir -p "$(@D)/package/extension/media";
	$(call run_silent, $(SUBST) source/package.t.json >"$(@D)/package/extension/package.json";)
	$(call run_silent, cp $(BUILD_DIR)/extension/*.js "$(@D)/package/extension/";)
	$(call run_silent, cp media/make.svg "$(@D)/package/extension/media/";)
	$(call run_silent, cp source/Content_Types.xml "$(@D)/package/[Content_Types].xml";)
	$(call run_silent, $(SUBST) source/extension.t.vsixmanifest > "$(@D)/package/extension.vsixmanifest";)
	$(call run_silent, (cd "$(@D)/package" && find . -type f -print0 | LC_ALL=C sort -z | TZ=UTC 7z a -mmt=off -mtm=off -mtc=off -mta=off -bso0 ../package.zip );)
	$(call run_silent, cp $(BUILD_DIR)/package.zip "$@";)

.PHONY: package
package: $(BUILD_DIR)/$(PACKAGE_NAME)
	$(info # create package)
	@:

.PHONY: all
all: package test tsconfig.json
	@:

.PHONY: clean
clean:
	@rm -rf $(BUILD_DIR)
	@rm -f tsconfig.json



tsconfig.json:
	@printf '%s\n' \
	'{' \
	'  "compilerOptions": {' \
	'    "target": "$(TSC_ES)",' \
	'    "module": "commonjs",' \
	'    "strict": true,' \
	'    "esModuleInterop": true,' \
	'    "skipLibCheck": true,' \
	'    "outDir": "$(BUILD_DIR)/extension",' \
	'    "rootDir": ".", ' \
	'    "typeRoots": ["$(TSC_TROOTS)"],' \
	'    "types": ["node"],' \
	'  },' \
	'  "files": [ "$(VSCODE_DTS)" ],' \
	'  "include": ["source/**/*.ts"],' \
	'}' > "$@"


-include make/user.mk
