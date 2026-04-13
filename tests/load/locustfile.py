"""Load tests for the CMP API using Locust.

Run with:
    locust -f tests/load/locustfile.py --host http://localhost:8000

Targets:
  - Health check: baseline latency
  - Config fetch: banner script config retrieval (~25KB gzipped target)
  - Consent recording: high-throughput POST endpoint
  - Geo-resolved config: config + GeoIP detection
"""

import uuid

from locust import HttpUser, between, task


class BannerScriptUser(HttpUser):
    """Simulates traffic from the banner script embedded on client websites.

    This is the highest-volume traffic pattern: every page view triggers
    a config fetch and potentially a consent recording.
    """

    wait_time = between(0.1, 0.5)

    def on_start(self) -> None:
        """Set up a visitor context."""
        self.visitor_id = str(uuid.uuid4())
        # Use a known test site ID — replace with an actual ID in your environment
        self.site_id = "00000000-0000-0000-0000-000000000001"

    @task(10)
    def health_check(self) -> None:
        """Baseline health check — should return in <10ms."""
        self.client.get("/health")

    @task(30)
    def fetch_config(self) -> None:
        """Fetch site config — the most common banner script request."""
        self.client.get(
            f"/api/v1/config/sites/{self.site_id}",
            name="/api/v1/config/sites/[site_id]",
        )

    @task(20)
    def fetch_resolved_config(self) -> None:
        """Fetch resolved config with region — simulates GeoIP flow."""
        self.client.get(
            f"/api/v1/config/sites/{self.site_id}/resolved?region=EU",
            name="/api/v1/config/sites/[site_id]/resolved",
        )

    @task(15)
    def fetch_geo_resolved_config(self) -> None:
        """Fetch geo-resolved config — includes GeoIP detection."""
        self.client.get(
            f"/api/v1/config/sites/{self.site_id}/geo-resolved",
            name="/api/v1/config/sites/[site_id]/geo-resolved",
            headers={"CF-IPCountry": "DE"},
        )

    @task(5)
    def detect_geo(self) -> None:
        """Detect visitor region."""
        self.client.get(
            "/api/v1/config/geo",
            headers={"CF-IPCountry": "FR"},
        )

    @task(20)
    def record_consent(self) -> None:
        """Record a consent decision — high-throughput POST endpoint."""
        self.client.post(
            "/api/v1/consent/",
            json={
                "site_id": self.site_id,
                "visitor_id": self.visitor_id,
                "action": "accept_all",
                "categories_accepted": [
                    "necessary",
                    "functional",
                    "analytics",
                    "marketing",
                    "personalisation",
                ],
                "categories_rejected": [],
                "gcm_state": {
                    "ad_storage": "granted",
                    "analytics_storage": "granted",
                    "functionality_storage": "granted",
                    "personalization_storage": "granted",
                    "security_storage": "granted",
                },
                "page_url": "https://example.com/page",
            },
            name="/api/v1/consent/",
        )


class AdminUser(HttpUser):
    """Simulates admin UI traffic — lower volume, authenticated requests."""

    wait_time = between(1, 3)
    weight = 1  # Much less traffic than banner scripts

    def on_start(self) -> None:
        """Authenticate and get a token."""
        resp = self.client.post(
            "/api/v1/auth/login",
            json={
                "email": "admin@test.com",
                "password": "TestPassword123",
            },
        )
        if resp.status_code == 200:
            self.token = resp.json().get("access_token", "")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            self.token = ""
            self.headers = {}

    @task(5)
    def list_sites(self) -> None:
        """List sites in the organisation."""
        self.client.get("/api/v1/sites/", headers=self.headers)

    @task(3)
    def check_compliance(self) -> None:
        """Run a compliance check."""
        site_id = "00000000-0000-0000-0000-000000000001"
        self.client.get(
            f"/api/v1/compliance/check/{site_id}?frameworks=gdpr,cnil",
            headers=self.headers,
            name="/api/v1/compliance/check/[site_id]",
        )

    @task(2)
    def consent_analytics(self) -> None:
        """Fetch consent analytics summary."""
        site_id = "00000000-0000-0000-0000-000000000001"
        self.client.get(
            f"/api/v1/analytics/summary/{site_id}",
            headers=self.headers,
            name="/api/v1/analytics/summary/[site_id]",
        )
