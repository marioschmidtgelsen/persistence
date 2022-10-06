export type ConstructorType<T extends object = object> = new(...args: any) => T
export interface Attribute<X, Y> {
    readonly name: string
    readonly type: Type<Y>
    readonly association: boolean
    readonly key: boolean
}
export interface Type<X> {
    readonly factory: X
}
export interface BasicType<X> extends Type<X> { }
export interface EntityType<X extends object = object> extends Type<ConstructorType<X>> {
    readonly attributes: Iterable<Attribute<X, any>>
}
export interface Metamodel {
    getEntityType<T extends object>(type: T | ConstructorType<T>): EntityType<T>
}

export function createAttribute<X, Y>(name: string, type: Type<Y>, association: boolean = false, key: boolean = false): Attribute<X, Y> {
    return new AttributeImpl(name, type, association, key)
}
export function createBasicType<X>(type: X): BasicType<X> {
    return new BasicTypeImpl(type)
}
export function createEntityType<X extends object>(type: ConstructorType<X>, attributes: Iterable<Attribute<X, any>>): EntityType<X> {
    return new EntityTypeImpl(type, attributes)
}
export function createMetamodel(entityTypes: Iterable<EntityType>) {
    return new MetamodelImpl(entityTypes)
}

class AttributeImpl<X, Y> implements Attribute<X, Y> {
    constructor(readonly name: string, readonly type: Type<Y>, readonly association: boolean = false, readonly key: boolean = false) { }
}
class TypeImpl<X> implements Type<X> {
    constructor(readonly factory: X) { }
}
class BasicTypeImpl<X> extends TypeImpl<X> implements BasicType<X> { }
class EntityTypeImpl<X extends object = object> implements EntityType<X> {
    constructor(readonly factory: ConstructorType<X>, readonly attributes: Iterable<Attribute<X, any>>) { }
}
class MetamodelImpl implements Metamodel {
    #entityTypes = new Map<ConstructorType, EntityType>()
    constructor(entityTypes: Iterable<EntityType>) {
        for (const entityType of entityTypes) {
            this.#entityTypes.set(entityType.factory, entityType)
        }
    }
    getEntityType<T extends object>(entityOrType: T | ConstructorType<T>): EntityType<T> {
        let constructor = typeof entityOrType == "object" && entityOrType.constructor && typeof entityOrType.constructor == "function"
                        ? entityOrType.constructor as ConstructorType<T>
                        : typeof entityOrType == "function"
                            ? entityOrType as ConstructorType<T>
                            : undefined
        if (!constructor) throw Error(`IllegalArgumentException`)
        return this.#entityTypes.get(constructor)! as EntityType<T>
    }
}