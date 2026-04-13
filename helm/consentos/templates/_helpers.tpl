{{/*
Common labels for all resources.
*/}}
{{- define "consentos.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/*
Selector labels for a specific component.
*/}}
{{- define "consentos.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Full name helper.
*/}}
{{- define "consentos.fullname" -}}
{{ .Release.Name }}-{{ .Chart.Name }}
{{- end }}

{{/*
Secret name — use existing or generated.
*/}}
{{- define "consentos.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "consentos.fullname" . }}-secrets
{{- end }}
{{- end }}

{{/*
Database URL — internal PostgreSQL or external.
*/}}
{{- define "consentos.databaseUrl" -}}
{{- if .Values.postgresql.enabled }}
postgresql+asyncpg://{{ .Values.postgresql.auth.username }}:$(POSTGRES_PASSWORD)@{{ include "consentos.fullname" . }}-postgresql:5432/{{ .Values.postgresql.auth.database }}
{{- else }}
{{- .Values.postgresql.externalUrl }}
{{- end }}
{{- end }}

{{/*
Redis URL — internal or external.
*/}}
{{- define "consentos.redisUrl" -}}
{{- if .Values.redis.enabled }}
redis://{{ include "consentos.fullname" . }}-redis:6379/0
{{- else }}
{{- .Values.redis.externalUrl }}
{{- end }}
{{- end }}
