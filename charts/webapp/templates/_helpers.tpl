{{/*
Object name prefix. The release is always "webapp" (contracts section 7),
so names become webapp-backend, webapp-frontend and so on.
*/}}
{{- define "webapp.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "webapp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "webapp.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "webapp.labels" -}}
helm.sh/chart: {{ include "webapp.chart" . }}
{{ include "webapp.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: aspecta
{{- end -}}

{{/*
Usage: include "webapp.componentLabels" (dict "root" $ "component" "backend")
*/}}
{{- define "webapp.componentLabels" -}}
{{ include "webapp.labels" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "webapp.componentSelectorLabels" -}}
{{ include "webapp.selectorLabels" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/*
Usage: include "webapp.image" (dict "image" .Values.backend.image "root" $)
*/}}
{{- define "webapp.image" -}}
{{- printf "%s:%s" .image.repository (default .root.Chart.AppVersion .image.tag) -}}
{{- end -}}

{{- define "webapp.backendHost" -}}
{{- printf "%s-backend" (include "webapp.fullname" .) -}}
{{- end -}}

{{/*
nginx drops server-level add_header directives in any location that sets its
own add_header, so every such location repeats this block.
*/}}
{{- define "webapp.frontend.securityHeaders" -}}
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self'" always;
{{- end -}}

{{/*
Annotation for objects whose CRDs come from other Argo CD apps
(External Secrets, kube-prometheus-stack).
*/}}
{{- define "webapp.crdSyncOptions" -}}
argocd.argoproj.io/sync-options: SkipDryRunOnMissingResource=true
{{- end -}}
