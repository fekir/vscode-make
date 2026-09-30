import {
  strict as assert
} from 'assert';
import {
  parseIncludes,
  parsePhonyTargets,
  parseTargets,
  parseVariables
} from '../make-parser';

// test parsing of single makefile targets
assert.deepEqual(
  parseTargets(`
.PHONY: all
all: $(BUILD_DIR)/package.vsix
$(BUILD_DIR)/package.vsix:
pattern-%:
	@echo ignored
clean: all
define HELP_TEXT
fake-target:
endef
`),
  ['all', '$(BUILD_DIR)/package.vsix', 'clean']
);

// test parsing of makefile includes
assert.deepEqual(parseIncludes(`
include make/user.mk
-include make/generated.mk
sinclude make/optional.mk

define HELP_TEXT
include dummy.mk
endef
`), ['make/user.mk', 'make/generated.mk', 'make/optional.mk']);

assert.deepEqual(parsePhonyTargets(`
.PHONY: all clean
.PHONY: install
`), new Set(['all', 'clean', 'install']));

// test parsing of variables
const variables = parseVariables(`
VAR1 ?= var1.1
VAR1 ?= var1.2
VAR2 := var2.1
VAR2 := var2.2
VAR3  = var3.1
VAR3  = var3.2
VAR4 += var4.1
VAR4 += var4.2
`);

assert.equal(variables.get('VAR1'), 'var1.1');
assert.equal(variables.get('VAR2'), 'var2.2');
assert.equal(variables.get('VAR3'), 'var3.2');
assert.equal(variables.get('VAR4'), 'var4.1 var4.2');

const assignmentVariables = parseVariables(`
BASE = before
IMMEDIATE := $(BASE)
BASE = after
RECURSIVE = $(BASE)
`);

assert.equal(assignmentVariables.get('IMMEDIATE'), 'before');
assert.equal(assignmentVariables.get('RECURSIVE'), '$(BASE)');
