export type Resource = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  category: string;
  createdAt: string;
};

export const resources: Resource[] = [
  {
    id: "res_001",
    name: "Landing page",
    description: "Primera versión de la pantalla inicial del proyecto.",
    status: "active",
    category: "content",
    createdAt: "2026-09-25T00:00:00.000Z",
  },
  {
    id: "res_002",
    name: "Configuración base",
    description: "Valores iniciales de entorno y estructura del backend.",
    status: "draft",
    category: "config",
    createdAt: "2026-09-25T00:00:00.000Z",
  },
];

export function findResourceById(id: string) {
  return resources.find((resource) => resource.id === id) ?? null;
}

export function createResource(input: Partial<Resource>): Resource {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const status = ["draft", "active", "archived"].includes(String(input.status))
    ? String(input.status)
    : "draft";

  if (!name) {
    throw new Error("El nombre del recurso es obligatorio.");
  }

  if (!category) {
    throw new Error("La categoría es obligatoria.");
  }

  const resource: Resource = {
    id: `res_${(resources.length + 1).toString().padStart(3, "0")}`,
    name,
    description: description || "Sin descripción.",
    status: status as "draft" | "active" | "archived",
    category,
    createdAt: new Date().toISOString(),
  };

  resources.push(resource);
  return resource;
}

export function updateResource(id: string, updates: Partial<Resource>) {
  const resourceIndex = resources.findIndex((resource) => resource.id === id);

  if (resourceIndex === -1) {
    return null;
  }

  const existing = resources[resourceIndex];
  const nextResource: Resource = {
    ...existing,
    ...updates,
    status: ["draft", "active", "archived"].includes(String(updates.status ?? existing.status))
      ? (String(updates.status ?? existing.status) as "draft" | "active" | "archived")
      : existing.status,
  };

  resources[resourceIndex] = nextResource;
  return nextResource;
}

export function deleteResource(id: string) {
  const resourceIndex = resources.findIndex((resource) => resource.id === id);

  if (resourceIndex === -1) {
    return false;
  }

  resources.splice(resourceIndex, 1);
  return true;
}
