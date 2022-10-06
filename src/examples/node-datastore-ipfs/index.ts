import { Author, Book } from "./BooksModel.js"
import { Repository } from "./BooksTypes.js"
import { DataStore } from "../../datastore/ipfs/index.js"

let datastore = new DataStore(Repository)
{
    let author = datastore.manager.persist(new Author())
    author.firstname = "Douglas"
    author.lastname = "Adams"
    let book = datastore.manager.persist(new Book())
    book.title = "Hitchhiker's Guide to the Universe"
    book.author = author
    await datastore.manager.flush()
}
{
    const key = "bafyreibpqbzy4qpyz7mkor6g6t6e4ljzur4cbcv46wrq2ranh45dtc3bjq"
    let author = await datastore.manager.find(Author, key)
    console.info(`Book loaded from DAG node: ${key}`)
    let fullname = author.fullname
    debugger
}