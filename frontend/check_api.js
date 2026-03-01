import axios from "axios";
(async () => {
  try {
    const res = await axios.post("http://127.0.0.1:8000/api/verify_site", {
        site_url: "https://example.com",
        username: "admin",
        app_password: "xxxx xxxx xxxx xxxx"
    });
    console.log("SUCCESS:", res.data);
  } catch (err) {
    console.log("FAIL:", err.response ? err.response.data : err.message);
  }
})();
