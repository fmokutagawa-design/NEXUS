"""JSON-lines adapter used by the offline proofreading benchmark."""
import json
import sys

from proofreader import Proofreader


def main():
    request = json.load(sys.stdin)
    issues = Proofreader().proofread(
        request.get("text", ""),
        mode="proof",
        profile=request.get("profile") or {},
    )
    json.dump(issues, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
