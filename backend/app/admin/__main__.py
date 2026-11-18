"""python -m app.admin <command>: see app/admin/cli.py."""
import sys

from .cli import main

sys.exit(main(sys.argv[1:]))
