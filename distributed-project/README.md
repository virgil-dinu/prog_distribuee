# Task Manager — Projet distribué

Application microservices déployée sur Kubernetes (Minikube).

## Architecture

```
            Ingress NGINX
                 |
   +-------------+--------------+
   |             |              |
Frontend    task-service --> notification-service
(nginx)     (Node.js)          (Node.js)
                |
            PostgreSQL
```

- **frontend** : page HTML servie par NGINX
- **task-service** : CRUD des tâches, persiste dans PostgreSQL, notifie `notification-service`
- **notification-service** : stocke et expose les événements (en mémoire)
- **postgres** : base de données, credentials dans un `Secret`
- **ingress** : `/` → frontend, `/api/*` → services
- **RBAC** : un `ServiceAccount` + `Role` par service

## Prérequis

Docker, Minikube, kubectl, compte Docker Hub.

## Déploiement

### 1. Démarrer Minikube

```bash
minikube start --driver=docker --memory=4096 --cpus=2
minikube addons enable ingress
```

### 2. Build et push des images

Remplacer `USERNAME` par votre identifiant Docker Hub.

```bash
docker login

for svc in task-service notification-service frontend; do
  docker build -t USERNAME/$svc:latest ./$svc
  docker push USERNAME/$svc:latest
done
```

### 3. Mettre à jour les manifests

Linux/Mac :
```bash
sed -i 's/YOUR_DOCKERHUB_USERNAME/USERNAME/g' k8s/*.yaml
```

PowerShell :
```powershell
(Get-ChildItem k8s\*.yaml) | ForEach-Object {
  (Get-Content $_) -replace 'YOUR_DOCKERHUB_USERNAME','USERNAME' | Set-Content $_
}
```

### 4. Déployer

```bash
kubectl apply -f k8s/
```

Les fichiers sont numérotés pour respecter l'ordre (Secret → DB → RBAC → services → Ingress).

### 5. Accéder à l'application

Dans un terminal séparé :
```bash
minikube tunnel
```

Puis ouvrir http://localhost/

## Tester l'API

```bash
curl -X POST http://localhost/api/tasks -H "Content-Type: application/json" -d '{"title":"Test"}'
curl http://localhost/api/tasks
curl http://localhost/api/notifications
curl -X DELETE http://localhost/api/tasks/1
```

## Commandes utiles

```bash
kubectl get pods
kubectl logs -l app=task-service -f
kubectl rollout restart deployment/task-service
kubectl delete -f k8s/
```

## Correspondance avec la grille

| Note | Critère | Livrable |
|------|---------|----------|
| 10 | Service local | `task-service` conteneurisé et déployé |
| 12 | Gateway | Ingress NGINX |
| 14 | Deux services communicants | `task-service` → `notification-service` via DNS K8s |
| 16 | Base de données | PostgreSQL + `Secret` |
| 18 | Sécurité cluster | RBAC (ServiceAccount + Role + RoleBinding) par service |

## Dépannage

- **`ImagePullBackOff`** : image absente de Docker Hub ou mauvais username dans les manifests.
- **`CrashLoopBackOff` sur task-service** : postgres pas prêt. 15 retries de 3s sont prévus, sinon `kubectl logs deployment/task-service`.
- **Ingress muet** : vérifier `minikube addons enable ingress` et que `minikube tunnel` tourne.
