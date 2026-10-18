"""Tests for scan.py price parsing and pricing.

Run: python3 -m unittest discover -s skill-cost/scripts
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scan import cost_of, from_official, price_of  # noqa: E402

PAGE = """# Pricing

## Model pricing

| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |
| :---- | :---------------- | :-------------- | :-------------- | :----------------------- | :------------ |
| Claude Opus 5.5 | $4 / MTok | $5 / MTok | $8 / MTok | $0.20 / MTok<sup>2</sup> | $20 / MTok |
| Claude Opus 5 | $5 / MTok | $6.25 / MTok | $10 / MTok | $0.50 / MTok | $25 / MTok |
| Claude Opus 4.8 | $5 / MTok | $6.25 / MTok | $10 / MTok | $0.50 / MTok | $25 / MTok |
| Claude Mythos 5.1 ([limited availability](https://example.com/a(b))) | $10 / MTok | $12.50 / MTok | $20 / MTok | $0.25 / MTok | $50 / MTok |
| Claude Haiku 5.5 (for prompts up to 100,000 tokens) | $0.10 / MTok | $0.125 / MTok | $0.20 / MTok | $0.01 / MTok | $0.50 / MTok |
| Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.50 / MTok | $0.625 / MTok | $1 / MTok | $0.05 / MTok | $2.50 / MTok |

## Feature-specific pricing

### Fast mode pricing

| Model | Input | Output |
| ----- | ----- | ------ |
| Claude Opus 5.5 | $8 USD / MTok | $40 USD / MTok |
| Claude Opus 5 / Claude Opus 4.8 | $10 USD / MTok | $50 USD / MTok |

### Batch processing
"""


def usage(**counts):
    return {
        "input_tokens": counts.get("input", 0),
        "output_tokens": counts.get("output", 0),
        "cache_read_input_tokens": counts.get("read", 0),
        "cache_creation_input_tokens": counts.get("write_5m", 0) + counts.get("write_1h", 0),
        "cache_creation": {
            "ephemeral_5m_input_tokens": counts.get("write_5m", 0),
            "ephemeral_1h_input_tokens": counts.get("write_1h", 0),
        },
        **({"speed": "fast"} if counts.get("fast") else {}),
    }


class ParseTest(unittest.TestCase):
    def setUp(self):
        self.models = from_official(PAGE)

    def test_model_ids_and_prices(self):
        self.assertEqual(
            sorted(self.models),
            ["claude-haiku-5-5", "claude-mythos-5-1", "claude-opus-4-8", "claude-opus-5", "claude-opus-5-5"],
        )
        self.assertEqual(
            self.models["claude-opus-5-5"],
            {"input": 4.0, "cacheWrite5m": 5.0, "cacheWrite1h": 8.0, "cacheRead": 0.2, "output": 20.0,
             "fastInput": 8.0, "fastOutput": 40.0},
        )

    def test_fast_row_with_several_models(self):
        for name in ("claude-opus-5", "claude-opus-4-8"):
            self.assertEqual((self.models[name]["fastInput"], self.models[name]["fastOutput"]), (10.0, 50.0))
        self.assertNotIn("fastInput", self.models["claude-mythos-5-1"])

    def test_long_prompt_tier(self):
        self.assertEqual(self.models["claude-haiku-5-5"]["input"], 0.1)
        self.assertEqual(self.models["claude-haiku-5-5"]["above100k"]["input"], 0.5)

    def test_rejects_broken_pages(self):
        for page in ("", "# Pricing", PAGE.replace("Base input tokens", "Input"), PAGE.split("### Fast")[0]):
            with self.assertRaises(ValueError):
                from_official(page)


class CostTest(unittest.TestCase):
    def setUp(self):
        self.prices = {"models": from_official(PAGE)}

    def test_all_token_kinds(self):
        cost = cost_of(self.prices, "claude-opus-5-5",
                       usage(input=1_000_000, output=1_000_000, read=1_000_000, write_5m=1_000_000, write_1h=1_000_000))
        self.assertAlmostEqual(cost, 4 + 20 + 0.2 + 5 + 8)

    def test_fast_mode_scales_cache_prices(self):
        cost = cost_of(self.prices, "claude-opus-5-5", usage(input=1_000_000, output=1_000_000, read=1_000_000, fast=True))
        # Fast input is twice the regular rate; cache reads scale by the same ratio
        self.assertAlmostEqual(cost, 8 + 40 + 0.4)

    def test_fast_mode_without_fast_prices_is_unpriced(self):
        self.assertIsNone(cost_of(self.prices, "claude-mythos-5-1", usage(input=10, fast=True)))

    def test_long_prompt_uses_higher_prices(self):
        short = cost_of(self.prices, "claude-haiku-5-5", usage(input=1_000, read=99_000, output=1_000_000))
        long = cost_of(self.prices, "claude-haiku-5-5", usage(input=1_000, read=100_000, output=1_000_000))
        self.assertAlmostEqual(short, (1_000 * 0.1 + 99_000 * 0.01) / 1_000_000 + 0.5)
        self.assertAlmostEqual(long, (1_000 * 0.5 + 100_000 * 0.05) / 1_000_000 + 2.5)

    def test_missing_price_field_is_unpriced(self):
        prices = {"models": {"claude-custom-1": {"input": 1.0, "output": 2.0}}}
        self.assertAlmostEqual(cost_of(prices, "claude-custom-1", usage(input=1_000_000)), 1.0)
        self.assertIsNone(cost_of(prices, "claude-custom-1", usage(read=10)))

    def test_model_id_matching(self):
        for model in ("claude-opus-5-5", "claude-opus-5-5-20260901", "claude-opus-5-5[1m]"):
            self.assertIsNotNone(price_of(self.prices, model), model)
        for model in ("claude-opus-5-5-beta", "claude-opus-4-9", "claude-opus"):
            self.assertIsNone(price_of(self.prices, model), model)


if __name__ == "__main__":
    unittest.main()
