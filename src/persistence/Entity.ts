import * as Meta from "./Meta.js"

export interface Manager {
    readonly metamodel: Meta.Metamodel
    contains<T extends object>(entity: T): boolean
    detach<T extends object>(entity: T): void
    find<T extends object>(type: T, key: any): AsyncGenerator<T>
    persist<T extends object>(entity: T): T
    remove<T extends object>(entity: T): void
    update<T extends object>(entity: T): Promise<void>
}
export class Manager implements Manager {
    #persisters = new Map<Meta.EntityType<any>, EntityPersister<any>>()
    constructor(readonly metamodel: Meta.Metamodel) { }
    contains<T extends object>(entity: T): boolean { return this.getEntityPersister(entity).contains(entity) }
    detach<T extends object>(entity: T): void { return this.getEntityPersister(entity).detach(entity) }
    async *find<T extends object>(type: T, key: any) { yield *this.getEntityPersister(type).find(key) }
    persist<T extends object>(entity: T): T { return this.getEntityPersister(entity).persist(entity) }
    remove<T extends object>(entity: T): void { this.getEntityPersister(entity).remove(entity) }
    async update<T extends object>(entity: T) { return this.getEntityPersister(entity).update(entity) }
    protected getEntityPersister<T extends object>(entity: T): EntityPersister<T> {
        let type = this.metamodel.getEntityType(entity)
        return this.#persisters.get(type) || this.createEntityPersister(type)
    }
    protected createEntityPersister<T extends object>(type: Meta.EntityType<T>) {
        let persister = new EntityPersister(this, type)
        this.#persisters.set(type, persister)
        return persister
    }
}

enum State {
    LOADED,
    CREATED,
    CHANGED,
    REMOVED
}
class EntityPersister<T extends object> {
    #entities = new Map<T, State>()
    constructor(readonly manager: Manager, readonly type: Meta.EntityType<T>) { }
    contains(entity: T): boolean { return this.#entities.has(entity) }
    detach(entity: T) { this.#entities.delete(entity) }
    async *find(key: any) {
        for (const entity of this.#entities.keys()) {
            for (const attribute of this.type.attributes) {
                if (attribute.key) {
                    let value = Reflect.get(entity, attribute.name)
                    if (key == value) {
                        yield entity as T
                    }
                }
            }
        }
    }
    persist(entity: T): T { this.#entities.set(entity, State.CREATED); return entity }
    remove(entity: T) { this.#entities.set(entity, State.REMOVED) }
    async update(entity: T) {
        let state = this.#entities.get(entity)!
        switch (state) {
            case (State.LOADED):
                break
            case (State.CREATED):
            case (State.CHANGED):
                await this.updateReferencedEntities(entity)
                this.#entities.set(entity, State.LOADED)
                break
            case (State.REMOVED):
                this.detach(entity)
                break
        }
    }
    protected async updateReferencedEntities(entity: T) {
        for await (const reference of this.getEntityReferences(entity)) {
            await this.manager.update(reference)
        }
    }
    protected async *getEntityReferences(entity: T) {
        for (const attribute of this.type.attributes) {
            if (attribute.association) {
                let reference = Reflect.get(entity, attribute.name) as T
                yield reference
            }
        }
    }
}