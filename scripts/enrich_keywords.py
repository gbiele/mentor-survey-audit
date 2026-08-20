#!/usr/bin/env python3
"""Enrich master survey dictionary with keywords using Gemini LLM and local caching."""

import json
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE_FILE = ROOT / "data" / "keyword_cache.json"


def enrich_variables_with_llm(variables, cache_file=CACHE_FILE, force_refresh=False):
    """
    Enriches a list of variable dictionaries with search keywords and semantic tags.
    Reads from and writes to a persistent cache file.
    """
    cache = {}
    if cache_file.exists() and not force_refresh:
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception as e:
            print(f"Warning: Could not load keyword cache ({e}), starting fresh.")
            cache = {}

    to_enrich = [v for v in variables if v["variable"] not in cache or force_refresh]
    api_key = os.environ.get("GEMINI_API_KEY")

    if to_enrich and api_key:
        print(f"Enriching {len(to_enrich)} variables with keywords via Gemini API...", flush=True)
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)

            # Batch into chunks of 50 variables
            batch_size = 50
            for i in range(0, len(to_enrich), batch_size):
                batch = to_enrich[i:i + batch_size]
                prompt_items = []
                for v in batch:
                    prompt_items.append({
                        "variable": v["variable"],
                        "section": v.get("section", ""),
                        "question_stem": v.get("question_stem", ""),
                        "item_text": v.get("item_text", ""),
                        "scale": v.get("scale", "")
                    })

                prompt = f"""
You are an expert psychometrician and survey auditor.
For each survey variable provided below, generate 3 to 6 search keywords and tags.
Include:
1. Psychological, clinical, or behavioral constructs (e.g., "depression", "anxiety", "social media", "bullying", "well-being", "sleep", "substance use", "demographics").
2. Standard scale / instrument acronyms if applicable (e.g., "phq-9", "gad-7", "who-5", "bcfpi", "sma", "igd", "macarthur").
3. Common layman / colloquial search terms and synonyms (e.g., "sadness", "screen time", "loneliness", "grades", "family wealth").

Return ONLY a valid JSON object mapping each variable ID to an array of lowercase string keywords:
{{
  "variable_name": ["keyword1", "keyword2", "keyword3"]
}}

Variables to tag:
{json.dumps(prompt_items, ensure_ascii=False, indent=2)}
"""

                response = client.models.generate_content(
                    model='gemini-3.7-flash',
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1
                    ),
                )

                batch_res = json.loads(response.text)
                if isinstance(batch_res, dict):
                    for var_name, kws in batch_res.items():
                        if isinstance(kws, list):
                            clean_kws = [str(k).strip().lower() for k in kws if str(k).strip()]
                            cache[var_name] = clean_kws
                print(f"  Processed batch {i // batch_size + 1}/{(len(to_enrich) + batch_size - 1) // batch_size} ({len(batch)} variables).", flush=True)

            # Persist updated cache
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(cache, f, indent=2, ensure_ascii=False)
            print(f"Saved keyword cache to {cache_file}", flush=True)

        except Exception as e:
            print(f"Error during Gemini keyword enrichment: {e}", flush=True)
            print("Continuing with existing cache / empty tags.", flush=True)
    elif to_enrich and not api_key:
        print(f"Note: {len(to_enrich)} variables lack cached keywords, but GEMINI_API_KEY is not set.", flush=True)

    # Assign keywords to variables
    for v in variables:
        v["keywords"] = cache.get(v["variable"], [])

    return variables


if __name__ == "__main__":
    import argparse
    from extract_dictionary import build_master_dictionary

    parser = argparse.ArgumentParser(description="Enrich master dictionary variables with LLM keywords")
    parser.add_argument("--force", action="store_true", help="Force refresh all keywords from Gemini API")
    args = parser.parse_args()

    print("Building and enriching master dictionary...")
    build_master_dictionary(force_refresh_keywords=args.force)
