
ifndef RUN_SILENT_PATTERN
  $(error RUN_SILENT_PATTERN must be defined before including run-silent.mk)
endif

force_color := $(if $(filter undefined,$(origin FORCE_COLOR)),,$(FORCE_COLOR))
no_color    := $(if $(filter undefined,$(origin NO_COLOR)),,$(NO_COLOR))

ESC :=
RED :=
RESET :=
YELLOW :=
ifneq ($(or $(force_color),$(and $(if $(no_color),,$(MAKE_TERMOUT)),$(MAKE_TERMERR))),)
  ESC    := $(shell printf '\033')
  RED    := $(ESC)[31m
  RESET  := $(ESC)[0m
  YELLOW := $(ESC)[33m
endif


define run_silent
    @\
    output=$$( ( $(1) ) 2>&1 ); \
    code=$$?; \
    if [ -n "$$output" ]; then :; output=$$( printf "%s\nX" "$$output" ); output=$${output%X}; fi; \
    if [ $$code -ne 0 ]; then :; \
        printf    "$(RED)%s\n%s$(RESET)" "$(1)" "$$output"; \
    elif printf '%s' "$$output" | grep -Eiq -- '$(RUN_SILENT_PATTERN)'; then \
        printf "$(YELLOW)%s\n%s$(RESET)" "$(1)" "$$output"; \
    elif [ "$(VERBOSE)" != "0" ]; then :; \
        printf '%s\n%s' "$(1)" "$$output"; \
    fi; \
    exit $$code;
endef

# make debug and make verbose targets
DEBUG ?= 0
ifneq ($(filter debug,$(MAKECMDGOALS)),)
override DEBUG := 1
endif
.PHONY: debug
debug:
	@:

VERBOSE ?= 0
ifneq ($(filter verbose,$(MAKECMDGOALS)),)
override VERBOSE := 1
endif
.PHONY: verbose
verbose:
	@:
