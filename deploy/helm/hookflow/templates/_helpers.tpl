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
{{/* dig (not plain dot-chaining) because this chart no longer ships
     a postgresql subchart - primary.service.ports.postgresql only has a
     value if a caller supplies their own subchart-shaped override, and dig
     tolerates the (now-default) case where those keys are absent entirely. */}}
{{- dig "primary" "service" "ports" "postgresql" 5432 .Values.postgresql }}
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
{{/* dig, for the same reason as hookflow.database.port above - this
     chart no longer ships a redis subchart. */}}
{{- dig "master" "service" "ports" "redis" 6379 .Values.redis }}
{{- else }}
{{- default 6379 .Values.redis.external.port }}
{{- end }}
{{- end }}
