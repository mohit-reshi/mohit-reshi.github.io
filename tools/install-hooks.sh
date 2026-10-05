#!/bin/sh
cd "$(git rev-parse --show-toplevel)" && chmod +x .githooks/* && git config core.hooksPath .githooks && echo "Git hooks installed (.githooks)."
