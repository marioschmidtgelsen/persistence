import * as Persistence from "../index.js"

(async function() {
    class Author {
        #firstname?: string
        #lastname?: string
        get firstname(): string { return this.#firstname! }
        set firstname(value: string) { this.#firstname = value }
        get lastname(): string { return this.#lastname! }
        set lastname(value: string) { this.#lastname = value }
        get fullname() {
            return this.#lastname && this.#lastname.length && this.#firstname && this.#firstname.length
                    ? this.#lastname!.concat(", ").concat(this.#firstname!)
                    : this.#lastname && this.#lastname.length
                    ? this.#lastname
                    : this.#firstname
            }
    }
    class Book {
        #title?: string
        #author?: Author = undefined
        get title() { return this.#title! }
        set title(value: string) { this.#title = value }
        get author() { return this.#author! }
        set author(value: Author) { this.#author = value }
    }
    function createMetamodel() {
        let stringType = Persistence.Meta.createBasicType(String)
        let firstnameAttribute = Persistence.Meta.createAttribute("firstname", stringType)
        let lastnameAttribute = Persistence.Meta.createAttribute("lastname", stringType)
        let fullnameAttribute = Persistence.Meta.createAttribute("fullname", stringType, false, true)
        let authorType = Persistence.Meta.createEntityType(Author, [firstnameAttribute, lastnameAttribute, fullnameAttribute])
        let titleAttribute = Persistence.Meta.createAttribute("title", stringType)
        let authorAttribute = Persistence.Meta.createAttribute("author", authorType, true)
        let bookType = Persistence.Meta.createEntityType(Book, [titleAttribute, authorAttribute])
        return Persistence.Meta.createMetamodel([bookType, authorType])
    }
    let metamodel = createMetamodel()
    let manager = new Persistence.Entity.Manager(metamodel)
    let author = manager.persist(new Author())
    author.firstname = "Douglas"
    author.lastname = "Adams"
    let book = manager.persist(new Book())
    book.title = "Hitchhiker's Guide to the Universe"
    book.author = author
    await manager.update(book)
})()
.catch(console.error)