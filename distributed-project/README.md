# Task Manager — Projet Distribué

Architecture microservices déployée sur Kubernetes (Minikube).

## Architecture

```
                  ┌───────────────┐
                  │   Ingress     │  (Gateway NGINX)
                  │   NGINX       │
                  └───────┬───────┘
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
      ┌─────────┐   ┌──────────┐  ┌──────────────┐
      │Frontend │   │   Task   │  │ Notification │
      │ (nginx) │   │ Service  │  │   Service    │
      │         │   │ (Node.js)│──▶│  (Node.js)  │
      └─────────┘   └────┬─────┘  └──────────────┘
                         │
                         ▼
                   ┌───────────┐
                   │ PostgreSQL│
                   └───────────┘
```

- **frontend** : page HTML/CSS servie par NGINX, appelle l'API via l'Ingress
- **task-service** : CRUD des tâches, persiste dans PostgreSQL, notifie notification-service
- **notification-service** : reçoit les événements, stocke en mémoire, expose la liste
- **postgres** : base de données, identifiants stockés dans un `Secret` K8s
- **ingress** : route `/` vers le frontend, `/api/*` vers les services
- **RBAC** : chaque service a son `ServiceAccount` avec des `Role` limitatifs

## Prérequis

- Docker Desktop (ou Docker Engine)
- Minikube : https://minikube.sigs.k8s.io/docs/start/
- kubectl : https://kubernetes.io/docs/tasks/tools/
- Un compte Docker Hub : https://hub.docker.com/

## Démarrage complet (ordre exact)

### 1. Démarrer Minikube avec Ingress

```bash
minikube start --driver=docker --memory=4096 --cpus=2
minikube addons enable ingress
```

Vérifier :
```bash
kubectl get pods -n ingress-nginx
```

### 2. Construire et publier les images Docker

Remplacer `YOUR_DOCKERHUB_USERNAME` par votre identifiant Docker Hub partout.

```bash
# Se connecter à Docker Hub
docker login

# Depuis la racine du projet
cd task-service
docker build -t YOUR_DOCKERHUB_USERNAME/task-service:latest .
docker push YOUR_DOCKERHUB_USERNAME/task-service:latest
cd ..

cd notification-service
docker build -t YOUR_DOCKERHUB_USERNAME/notification-service:latest .
docker push YOUR_DOCKERHUB_USERNAME/notification-service:latest
cd ..

cd frontend
docker build -t YOUR_DOCKERHUB_USERNAME/frontend:latest .
docker push YOUR_DOCKERHUB_USERNAME/frontend:latest
cd ..
```

### 3. Mettre à jour les manifests avec votre username

Sur Linux/Mac :
```bash
sed -i 's/YOUR_DOCKERHUB_USERNAME/votre_username/g' k8s/*.yaml
```

Sur Windows PowerShell :
```powershell
(Get-ChildItem k8s\*.yaml) | ForEach-Object {
  (Get-Content $_) -replace 'YOUR_DOCKERHUB_USERNAME','votre_username' | Set-Content $_
}
```

### 4. Déployer dans Kubernetes

```bash
kubectl apply -f k8s/
```

Les fichiers sont numérotés `01-`, `02-`, etc. pour garantir l'ordre : Secret d'abord, puis base, puis RBAC, puis services, puis Ingress.

### 5. Vérifier le déploiement

```bash
kubectl get pods
kubectl get svc
kubectl get ingress
```

Attendre que tous les pods soient en état `Running` et `Ready`.

### 6. Accéder à l'application

```bash
minikube tunnel
```

(Laisser cette commande tourner dans un terminal séparé, demander le mot de passe sudo.)

Puis ouvrir : **http://localhost/**

Alternative sans tunnel :
```bash
minikube ip
# Utiliser l'IP retournée : http://<IP>/
```

## Tester l'API directement (curl)

```bash
# Créer une tâche
curl -X POST http://localhost/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Test"}'

# Lister les tâches
curl http://localhost/api/tasks

# Lister les notifications (l'appel ci-dessus a dû en générer une)
curl http://localhost/api/notifications

# Supprimer
curl -X DELETE http://localhost/api/tasks/1
```

## Commandes utiles

```bash
# Logs d'un service
kubectl logs -l app=task-service --tail=50 -f
kubectl logs -l app=notification-service --tail=50 -f

# Redémarrer un déploiement (après push d'une nouvelle image)
kubectl rollout restart deployment/task-service

# Accéder au pod postgres
kubectl exec -it deployment/postgres -- psql -U taskuser -d tasksdb

# Supprimer tout
kubectl delete -f k8s/
```

## Couverture de la grille d'évaluation

| Palier | Livrable |
|--------|----------|
| 10/20 — un service local | `task-service` : Node.js, Dockerfile, image Docker Hub, Deployment + Service K8s |
| 12/20 — gateway | Ingress NGINX routant `/` et `/api/*` |
| 14/20 — deux services reliés | `task-service` appelle `notification-service` en REST via le DNS K8s |
| 16/20 — base de données | PostgreSQL déployé dans K8s, connexion depuis `task-service`, mot de passe via `Secret` |
| 18/20 — sécurité cluster | `ServiceAccount` + `Role` + `RoleBinding` (RBAC) par service, `Secret` pour les credentials DB, principe de moindre privilège |

## Dépannage

**Pods en `ImagePullBackOff`** : l'image n'est pas trouvée sur Docker Hub. Vérifier que `docker push` a bien fonctionné et que le username dans les manifests est correct.

**`task-service` en `CrashLoopBackOff`** : probablement postgres pas encore prêt. Le code a 15 retries de 3 secondes. Si persistant : `kubectl logs deployment/task-service`.

**Ingress ne répond pas** : vérifier `minikube addons enable ingress` et que `minikube tunnel` tourne.

**Port 80 déjà utilisé (Windows/Mac)** : utiliser `minikube ip` et accéder par l'IP du cluster.
