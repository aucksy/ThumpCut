"""ThumpCut Factory — the offline beat pipeline.

Runs on a machine or a cheap VPS. Never runs on a user's phone.

Pulls the trending track list and the actual audio from Meta's Instagram Audio API,
computes a beat map for each track, and publishes the results as static JSON.

Entry point: ``python -m factory.run``
"""

__version__ = "0.1.0"
