import * as Persistence from "../../persistence/index.js"
import * as IPFSHTTPClient from "ipfs-http-client"

export class DataStore implements Persistence.Entity.QueryFactory, Persistence.Entity.TransactionFactory {
    readonly ipfs: IPFSHTTPClient.IPFSHTTPClient
    readonly manager: Persistence.Entity.Manager
    constructor(readonly metamodel: Persistence.Meta.Metamodel, readonly options: IPFSHTTPClient.Options = { url: "http://localhost:5001" }) {
        this.ipfs = IPFSHTTPClient.create(options)
        this.manager = new Persistence.Entity.Manager(metamodel, this, this)
    }
    createQuery<T extends object>(type: Persistence.Meta.EntityType<T>) { return new Query(this, type) }
    createTransaction() { return new Transaction(this) }
}
class Query<T extends object> extends Persistence.Entity.Query<T> implements Persistence.Entity.Query<T> {
    constructor(readonly datastore: DataStore, readonly type: Persistence.Meta.EntityType<T>) { super(datastore.manager, type) }
    protected async select(key: any): Promise<T> {
        const cid = typeof key == "string" ? IPFSHTTPClient.CID.parse(key) : key
        const node = await this.datastore.ipfs.dag.get(cid!)
        const entity = new this.type.type()
        for (const attribute of this.type.attributes) {
            if (attribute.association) {
                const key = Reflect.get(node.value, attribute.name)
                const value = await this.datastore.manager.find(attribute.type.type, key)
                const result = Reflect.set(entity, attribute.name, value)
                if (!result) throw new Error("IllegalAccessException")
            } else {
                const value = Reflect.get(node.value, attribute.name)
                const result = Reflect.set(entity, attribute.name, value)
                if (!result) throw new Error("IllegalAccessException")
            }
        }
        return entity
    }
}
class Transaction extends Persistence.Entity.Transaction implements Persistence.Entity.Transaction {
    constructor(readonly datastore: DataStore) { super(datastore.manager) }
    protected createPersister<T extends object>(type: Persistence.Meta.EntityType<T>) { return new Persister(this, type) }
}
class Persister<T extends object> extends Persistence.Entity.Persister<T> implements Persistence.Entity.Persister<T> {
    constructor(readonly transaction: Transaction, readonly type: Persistence.Meta.EntityType<T>) { super(transaction, type) }
    protected async delete(entity: T, key: any) { throw new Error("Method not implemented.") }
    protected async insert(entity: T) {
        let entries = new Map<string, any>()
        for (const attribute of this.type.attributes) {
            if (attribute.association) {
                let value = Reflect.get(entity, attribute.name) as object
                let key = this.transaction.key(value)
                entries.set(attribute.name, key)
            }
            else {
                let value = Reflect.get(entity, attribute.name)
                entries.set(attribute.name, value)
            }
        }
        let node = Object.fromEntries(entries)
        let cid = await this.transaction.datastore.ipfs.dag.put(node)
        this.setKey(entity, cid)
        return cid
    }
    protected async update(entity: T, key: any) { throw new Error("Method not implemented.") }
}