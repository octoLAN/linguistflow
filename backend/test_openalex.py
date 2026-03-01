import asyncio
from app.services.autonomous_agent import fetch_openalex_sources
async def main():
    res = await fetch_openalex_sources("KI in der Erklärvideo-Produktion")
    print(f"Result length: {len(res)}\nResult: {res}")
asyncio.run(main())
