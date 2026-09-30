# user defined targets, do not commit

.PHONY: user-defined-target
user-defined-target:
	@echo "Hello from user.mk"

-include make/user2.mk
