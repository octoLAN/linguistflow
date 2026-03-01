from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import httpx

from app.core.security import get_current_customer

router = APIRouter(prefix="/api", tags=["integrations"])

class VerifySiteRequest(BaseModel):
    site_url: str
    username: str
    app_password: str

@router.post("/verify_site")
async def verify_site(
    req: VerifySiteRequest,
    _: dict = Depends(get_current_customer),
):
    """
    Verify application password credentials against a WordPress REST API.
    """
    url = req.site_url.rstrip("/") + "/wp-json/wp/v2/users/me"
    
    # Strip spaces from app password, which WordPress usually presents in chunks
    password = req.app_password.replace(" ", "")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                url, 
                auth=(req.username, password)
            )
            
            if response.status_code == 200:
                return {"status": "ok", "message": "Connection verified"}
            
            error_data = response.json() if "application/json" in response.headers.get("Content-Type", "") else {}
            error_message = error_data.get("message", f"WordPress returned status {response.status_code}")
            
            raise HTTPException(
                status_code=400, 
                detail=f"Connection failed: {error_message}"
            )
            
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=400, 
            detail="Could not reach the WordPress site. Please check the URL."
        )
