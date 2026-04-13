"""Pydantic schemas for compliance check results."""

from enum import StrEnum

from pydantic import BaseModel, Field


class Severity(StrEnum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class Framework(StrEnum):
    GDPR = "gdpr"
    CNIL = "cnil"
    CCPA = "ccpa"
    EPRIVACY = "eprivacy"
    LGPD = "lgpd"


class ComplianceIssue(BaseModel):
    """A single compliance issue found during a check."""

    rule_id: str
    severity: Severity
    message: str
    recommendation: str


class FrameworkResult(BaseModel):
    """Compliance result for a single regulatory framework."""

    framework: Framework
    score: int = Field(ge=0, le=100, description="Compliance score (0-100)")
    status: str = Field(description="Overall status: compliant, partial, non_compliant")
    issues: list[ComplianceIssue] = Field(default_factory=list)
    rules_checked: int = 0
    rules_passed: int = 0


class ComplianceCheckRequest(BaseModel):
    """Request body for compliance checks."""

    frameworks: list[Framework] | None = Field(
        default=None,
        description="Frameworks to check. If null, all frameworks are checked.",
    )


class ComplianceCheckResponse(BaseModel):
    """Full compliance check response for a site."""

    site_id: str
    results: list[FrameworkResult]
    overall_score: int = Field(ge=0, le=100, description="Weighted average across all frameworks")
