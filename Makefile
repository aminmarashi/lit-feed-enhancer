build = build/

ifeq ($(project),)
$(error project is not specified, call syntax: make project=project-name)
endif

ifeq ($(wildcard src/$(project)/.),)
$(error project is not specified correctly, call syntax: make project=project-name)
endif

.$(project)-hash: $(shell find src/$(project) -type f)
	@echo "$(project) has changed"
	@touch $@

$(build)$(project).zip: .$(project)-hash
	@echo "Building $(project)"
	@node esbuild.js src/$(project)/index.ts
	@mkdir -p $(build) && pushd dist && zip -r ../$(build)$(project).zip * && popd
