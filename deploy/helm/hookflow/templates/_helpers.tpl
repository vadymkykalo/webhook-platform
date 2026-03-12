{{/*
Expand the name of the chart.
*/}}
{{- define "hookflow.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "hookflow.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "hookflow.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "hookflow.labels" -}}
helm.sh/chart: {{ include "hookflow.chart" . }}
{{ include "hookflow.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "hookflow.selectorLabels" -}}
app.kubernetes.io/name: {{ include "hookflow.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "hookflow.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "hookflow.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Database host
*/}}
{{- define "hookflow.database.host" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" (include "hookflow.fullname" .) }}
{{- else }}
{{- .Values.postgresql.external.host }}
{{- end }}
{{- end }}

{{/*
Database port
*/}}
{{- define "hookflow.database.port" -}}
{{- if .Values.postgresql.enabled }}
{{- default 5432 .Values.postgresql.primary.service.ports.postgresql }}
{{- else }}
{{- default 5432 .Values.postgresql.external.port }}
{{- end }}
{{- end }}

{{/*
Kafka bootstrap servers
*/}}
{{- define "hookflow.kafka.bootstrapServers" -}}
{{- if .Values.kafka.enabled }}
{{- printf "%s-kafka:9092" (include "hookflow.fullname" .) }}
{{- else }}
{{- .Values.kafka.external.bootstrapServers }}
{{- end }}
{{- end }}

{{/*
Redis host
*/}}
{{- define "hookflow.redis.host" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis-master" (include "hookflow.fullname" .) }}
{{- else }}
{{- .Values.redis.external.host }}
{{- end }}
{{- end }}

{{/*
Redis port
*/}}
{{- define "hookflow.redis.port" -}}
{{- if .Values.redis.enabled }}
{{- default 6379 .Values.redis.master.service.ports.redis }}
{{- else }}
{{- default 6379 .Values.redis.external.port }}
{{- end }}
{{- end }}
